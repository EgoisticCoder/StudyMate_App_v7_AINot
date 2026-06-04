import { readQuery, writeQuery } from './neo4j';
import { addXP, updateStreakAndActivity } from './gamification';
import { getSubjectStates } from './adaptiveEngine';

export interface Mission {
  id: string;
  type: 'daily' | 'weekly';
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardXP: number;
  status: 'active' | 'completed';
  actionType: string;
  subject?: string;
}

/**
 * Ensures the student has active daily and weekly missions.
 * Generates them if missing or expired.
 */
export async function generateMissions(studentId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // 1. Mark expired daily missions as expired
  await writeQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission {type: 'daily'})
     WHERE m.date < $today AND m.status = 'active'
     SET m.status = 'expired'`,
    { studentId, today }
  );

  // 2. Check if we need new daily missions
  const dailyRes = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission {type: 'daily', date: $today})
     RETURN count(m) AS activeCount`,
    { studentId, today }
  );
  
  if (dailyRes.length > 0 && dailyRes[0].get('activeCount') === 0) {
    // Generate new Daily Missions
    
    // Mission 1: Fixed Study Goal (e.g. complete 2 slots)
    await createMission(studentId, {
      id: `m_daily_study_${Date.now()}`,
      type: 'daily',
      title: 'Daily Scholar',
      description: 'Complete 2 study slots today',
      target: 2,
      rewardXP: 50,
      actionType: 'study_slot',
      date: today
    });

    // Mission 2: Dynamic (based on weakness)
    try {
      const states = await getSubjectStates(studentId);
      const weakSubjects = states.filter(s => s.state === 'EMPIRICALLY_WEAK' || s.state === 'AVOIDED_AND_WEAK');
      if (weakSubjects.length > 0) {
        const targetSubject = weakSubjects[0].subject;
        await createMission(studentId, {
          id: `m_daily_quiz_${Date.now()}`,
          type: 'daily',
          title: `Focus: ${targetSubject}`,
          description: `Take a quiz in ${targetSubject}`,
          target: 1,
          rewardXP: 75,
          actionType: 'quiz_completed',
          subject: targetSubject,
          date: today
        });
      } else {
        // Fallback dynamic mission
        await createMission(studentId, {
          id: `m_daily_quiz_${Date.now()}`,
          type: 'daily',
          title: `Quiz Master`,
          description: `Complete 1 quiz today`,
          target: 1,
          rewardXP: 50,
          actionType: 'quiz_completed',
          date: today
        });
      }
    } catch (err) {
      console.error('Failed to generate dynamic mission:', err);
    }
  }

  // TODO: Weekly missions logic could be added similarly using week start dates
}

async function createMission(studentId: string, data: any) {
  await writeQuery(
    `MATCH (s:Student {id: $studentId})
     CREATE (m:Mission {
       id: $data.id,
       type: $data.type,
       title: $data.title,
       description: $data.description,
       target: $data.target,
       progress: 0,
       rewardXP: $data.rewardXP,
       status: 'active',
       actionType: $data.actionType,
       subject: $data.subject,
       date: $data.date
     })
     CREATE (s)-[:HAS_MISSION]->(m)`,
    { studentId, data }
  );
}

/**
 * Retrieve active missions for the student.
 */
export async function getActiveMissions(studentId: string): Promise<Mission[]> {
  // Auto-generate if missing
  await generateMissions(studentId);

  const today = new Date().toISOString().split('T')[0];
  const res = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission)
     WHERE m.status = 'active' AND (m.type = 'weekly' OR m.date = $today)
     RETURN m
     ORDER BY m.type ASC`, // daily first
    { studentId, today }
  );

  return res.map(r => r.get('m').properties as Mission);
}

/**
 * Progresses a specific action type for a student.
 */
export async function progressMission(studentId: string, actionType: string, amount: number = 1, subject?: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // First update streak/activity globally since they did an action
  await updateStreakAndActivity(studentId);

  // Find active missions matching actionType
  const res = await readQuery(
    `MATCH (s:Student {id: $studentId})-[:HAS_MISSION]->(m:Mission {status: 'active'})
     WHERE m.actionType = $actionType AND (m.type = 'weekly' OR m.date = $today)
     RETURN m`,
    { studentId, actionType, today }
  );

  for (const row of res) {
    const m = row.get('m').properties;
    
    // If the mission requires a specific subject, check it
    if (m.subject && subject && m.subject !== subject) {
      continue;
    }

    const newProgress = Math.min(m.progress + amount, m.target);
    const completed = newProgress >= m.target;

    await writeQuery(
      `MATCH (m:Mission {id: $missionId})
       SET m.progress = $newProgress,
           m.status = CASE WHEN $completed THEN 'completed' ELSE m.status END`,
      { missionId: m.id, newProgress, completed }
    );

    if (completed && m.progress < m.target) { // Prevent double-rewarding
      await addXP(studentId, m.rewardXP, `Completed Mission: ${m.title}`);
    }
  }
}
