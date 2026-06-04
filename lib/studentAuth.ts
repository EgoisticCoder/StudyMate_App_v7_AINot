import { readQuery, writeQuery } from './neo4j';
import { hashPassword, verifyPassword } from './password';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isEmailRegistered(email: string): Promise<boolean> {
  const norm = normalizeEmail(email);
  const recs = await readQuery(
    `MATCH (s:Student {email: $email}) RETURN count(s) AS c`,
    { email: norm }
  );
  const c = recs[0]?.get('c');
  return typeof c === 'number' ? c > 0 : Number(c) > 0;
}

export async function authenticateStudent(
  email: string,
  plainPassword: string
): Promise<{ id: string } | null> {
  const norm = normalizeEmail(email);
  const recs = await readQuery(
    `MATCH (s:Student {email: $email}) RETURN s`,
    { email: norm }
  );
  if (!recs.length) return null;

  const props = recs[0].get('s').properties as Record<string, unknown>;
  const id = props.id as string;
  const salt = props.password_salt as string | undefined;
  const hash = props.password_hash as string | undefined;
  if (!salt || !hash) {
    return null;
  }
  const ok = await verifyPassword(plainPassword, salt, hash);
  if (!ok) return null;

  await writeQuery(
    `MATCH (s:Student {id: $id}) SET s.last_active = datetime()`,
    { id }
  );
  return { id };
}
