import { readQuery, writeQuery, writeTransaction } from './neo4j';
import { callGroq, parseGroqJSON } from './groq';
import { v4 as uuidv4 } from 'uuid';
import { weekKeyFromDate } from './weekUtils';
import { progressMission } from './missions';

export interface TimetableSlotRow {
  id: string;
  week_start: string;
  day_index: number;
  day_name: string;
  slot_order: number;
  title: string;
  minutes_estimate: number;
  done: boolean;
  time_slot: string;    // e.g. "07:00-08:00"
  subject: string;      // e.g. "Mathematics"
  sticky_note: string;  // user-editable chapter note
}

const DAY_TO_INDEX: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const INDEX_TO_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface ExtractedSlot {
  day: string;
  title: string;
  minutes?: number;
  order?: number;
  time_slot?: string;
  subject?: string;
}

export async function extractSlotsFromPlanMarkdown(markdown: string): Promise<ExtractedSlot[]> {
  const raw = await callGroq(
    [
      {
        role: 'system',
        content:
          'Extract study tasks from the schedule text. Output ONLY valid JSON array. Each item: {"day":"Monday","title":"short task label","minutes":40,"order":1,"time_slot":"16:00-17:00","subject":"Mathematics"}. Days: Monday-Sunday. Max 28 tasks. No markdown. time_slot should be in HH:MM-HH:MM format. subject should be the school subject name.',
      },
      {
        role: 'user',
        content: `Schedule text:\n\n${markdown.slice(0, 12000)}`,
      },
    ],
    'slot_extractor'
  );

  let parsed: ExtractedSlot[];
  try {
    parsed = parseGroqJSON<ExtractedSlot[]>(raw);
  } catch {
    const retry = await callGroq(
      [
        { role: 'system', content: 'Return ONLY a JSON array of {day,title,minutes?,order?}.' },
        { role: 'user', content: markdown.slice(0, 12000) },
      ],
      'slot_extractor'
    );
    parsed = parseGroqJSON<ExtractedSlot[]>(retry);
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.filter(s => s.title && s.day);
}

function normalizeDay(dayRaw: string): { index: number; name: string } | null {
  const key = dayRaw.trim().toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, number> = {
    monday: 0,
    mon: 0,
    tuesday: 1,
    tue: 1,
    wednesday: 2,
    wed: 2,
    thursday: 3,
    thu: 3,
    friday: 4,
    fri: 4,
    saturday: 5,
    sat: 5,
    sunday: 6,
    sun: 6,
  };
  const idx = map[key];
  if (idx === undefined) return null;
  return { index: idx, name: INDEX_TO_NAME[idx] };
}

/**
 * Replace all slots for this student + week with new rows.
 */
export async function replaceSlotsForWeek(
  studentId: string,
  weekStartKey: string,
  extracted: ExtractedSlot[]
): Promise<void> {
  await writeQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot)
     WHERE slot.week_start = $week_start
     DETACH DELETE slot`,
    { studentId, week_start: weekStartKey }
  );

  const queries: Array<{ cypher: string; params: Record<string, unknown> }> = [];

  extracted.forEach((item, i) => {
    const norm = normalizeDay(item.day || 'Monday');
    if (!norm) return;
    const id = uuidv4();
    const order = typeof item.order === 'number' ? item.order : i + 1;
    const mins = typeof item.minutes === 'number' ? item.minutes : 30;

    queries.push({
      cypher: `
        MATCH (s:Student {id: $studentId})
        CREATE (slot:TimetableSlot {
          id: $id,
          week_start: $week_start,
          day_index: $day_index,
          day_name: $day_name,
          slot_order: $slot_order,
          title: $title,
          minutes_estimate: $minutes_estimate,
          done: false,
          created_at: datetime(),
          time_slot: $time_slot,
          subject: $subject,
          sticky_note: ''
        })
        CREATE (s)-[:HAS_TIMETABLE_SLOT]->(slot)
      `,
      params: {
        studentId,
        id,
        week_start: weekStartKey,
        day_index: norm.index,
        day_name: norm.name,
        slot_order: order,
        title: String(item.title).slice(0, 500),
        minutes_estimate: mins,
        time_slot: item.time_slot || '',
        subject: item.subject || '',
      },
    });
  });

  if (queries.length) await writeTransaction(queries);
}

export async function loadSlotsForWeek(
  studentId: string,
  weekStartKey: string
): Promise<TimetableSlotRow[]> {
  const recs = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot)
     WHERE slot.week_start = $week_start
     RETURN slot
     ORDER BY slot.day_index ASC, slot.slot_order ASC`,
    { studentId, week_start: weekStartKey }
  );

  return recs.map(r => {
    const p = r.get('slot').properties as Record<string, unknown>;
    return {
      id: String(p.id),
      week_start: String(p.week_start),
      day_index: Number(p.day_index ?? 0),
      day_name: String(p.day_name ?? ''),
      slot_order: Number(p.slot_order ?? 0),
      title: String(p.title ?? ''),
      minutes_estimate: Number(p.minutes_estimate ?? 0),
      done: Boolean(p.done),
      time_slot: String(p.time_slot ?? ''),
      subject: String(p.subject ?? ''),
      sticky_note: String(p.sticky_note ?? ''),
    };
  });
}

export async function setSlotDone(
  studentId: string,
  slotId: string,
  done: boolean
): Promise<void> {
  await writeQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot {id: $slotId})
     SET slot.done = $done,
         slot.completed_at = CASE WHEN $done THEN datetime() ELSE NULL END`,
    { studentId, slotId, done }
  );

  if (done) {
    // Fire gamification trigger asynchronously
    progressMission(studentId, 'study_slot', 1).catch(err => console.error('Gamification hook failed:', err));
  }
}

export async function updateSlotNote(
  studentId: string,
  slotId: string,
  note: string
): Promise<void> {
  await writeQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot {id: $slotId})
     SET slot.sticky_note = $note`,
    { studentId, slotId, note }
  );
}

export async function updateSlot(
  studentId: string,
  slotId: string,
  updates: { title?: string; subject?: string; time_slot?: string; minutes_estimate?: number }
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { studentId, slotId };

  if (updates.title !== undefined) { setClauses.push('slot.title = $title'); params.title = updates.title; }
  if (updates.subject !== undefined) { setClauses.push('slot.subject = $subject'); params.subject = updates.subject; }
  if (updates.time_slot !== undefined) { setClauses.push('slot.time_slot = $time_slot'); params.time_slot = updates.time_slot; }
  if (updates.minutes_estimate !== undefined) { setClauses.push('slot.minutes_estimate = $mins'); params.mins = updates.minutes_estimate; }

  if (setClauses.length === 0) return;

  await writeQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot {id: $slotId})
     SET ${setClauses.join(', ')}`,
    params
  );
}

export async function getLatestStudyPlanBody(studentId: string): Promise<string | null> {
  const recs = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_STUDY_PLAN]->(sp:StudyPlan)
     RETURN sp.body AS body
     ORDER BY sp.created_at DESC LIMIT 1`,
    { studentId }
  );
  if (!recs.length) return null;
  const body = recs[0].get('body');
  return typeof body === 'string' ? body : null;
}

/**
 * If no slots exist for the current ISO week but a saved StudyPlan exists, extract and create slots (weekly refresh).
 */
export async function ensureSlotsForCurrentWeek(studentId: string): Promise<boolean> {
  const weekKey = weekKeyFromDate();
  const existing = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot {week_start: $wk})
     RETURN count(slot) AS c`,
    { studentId, wk: weekKey }
  );
  const c = existing[0]?.get('c');
  const n = typeof c === 'number' ? c : Number(c);
  if (n > 0) return false;

  const body = await getLatestStudyPlanBody(studentId);
  if (!body?.trim()) return false;

  const extracted = await extractSlotsFromPlanMarkdown(body);
  if (!extracted.length) return false;

  await replaceSlotsForWeek(studentId, weekKey, extracted);
  return true;
}
