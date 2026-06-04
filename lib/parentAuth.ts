import { readQuery } from './neo4j';
import { verifyPassword } from './password';
import { normalizeEmail } from './studentAuth';

export type ParentAuthResult =
  | { success: true; studentId: string }
  | { success: false; reason: 'email_not_found' | 'pin_not_set' | 'wrong_pin' };

export async function verifyParentAccess(email: string, pin: string): Promise<ParentAuthResult> {
  const norm = normalizeEmail(email);
  const recs = await readQuery(`MATCH (s:Student {email: $email}) RETURN s`, { email: norm });
  if (!recs.length) return { success: false, reason: 'email_not_found' };

  const props = recs[0].get('s').properties as Record<string, unknown>;
  const id = props.id as string;
  const salt = props.parent_pin_salt as string | undefined;
  const hash = props.parent_pin_hash as string | undefined;
  if (!salt || !hash) return { success: false, reason: 'pin_not_set' };

  const ok = await verifyPassword(pin, salt, hash);
  if (!ok) return { success: false, reason: 'wrong_pin' };
  return { success: true, studentId: id };
}

/**
 * Read parent notes for a student. Returns null if no notes exist.
 */
export async function getParentNotes(studentId: string): Promise<{
  studyNotes: string;
  weaknessNotes: string;
  updatedAt: string | null;
} | null> {
  try {
    const recs = await readQuery(
      `MATCH (s:Student {id: $studentId})
       RETURN s.parent_study_notes AS studyNotes,
              s.parent_weakness_notes AS weaknessNotes,
              s.parent_notes_updated_at AS updatedAt`,
      { studentId }
    );
    if (!recs.length) return null;
    const studyNotes = recs[0].get('studyNotes') || '';
    const weaknessNotes = recs[0].get('weaknessNotes') || '';
    const updatedAt = recs[0].get('updatedAt')?.toString() || null;
    if (!studyNotes && !weaknessNotes) return null;
    return { studyNotes, weaknessNotes, updatedAt };
  } catch {
    return null;
  }
}
