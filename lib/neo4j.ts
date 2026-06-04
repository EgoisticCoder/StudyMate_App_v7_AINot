// Neo4j AuraDB client wrapper
// All queries are parameterized — no string concatenation

import neo4j, { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver';
import { Platform } from 'react-native';

let driver: Driver | null = null;

// Storage abstraction for SecureStore (mobile) / localStorage (web)
export async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage getItem failed:', e);
      return null;
    }
  }
  try {
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('localStorage setItem failed:', e);
    }
    return;
  }
  try {
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Fallback — ignore
  }
}

export async function deleteStoredValue(key: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('localStorage removeItem failed:', e);
    }
    return;
  }
  try {
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Fallback
  }
}

/**
 * Initialize or re-initialize the Neo4j driver using stored credentials.
 */
export async function initNeo4j(): Promise<boolean> {
  try {
    let uri = await getStoredValue('neo4j_uri');
    let username = await getStoredValue('neo4j_username');
    let password = await getStoredValue('neo4j_password');

    // Clear stale incorrect username 'neo4j'
    if (username === 'neo4j') {
      username = null;
      await deleteStoredValue('neo4j_username');
    }

    // Fallback to environment variables
    let finalUri = uri || process.env.EXPO_PUBLIC_NEO4J_URI || null;
    let finalUsername = username || process.env.EXPO_PUBLIC_NEO4J_USERNAME || null;
    let finalPassword = password || process.env.EXPO_PUBLIC_NEO4J_PASSWORD || null;

    if (!finalUri || !finalUsername || !finalPassword) {
      console.warn('Neo4j credentials not configured');
      return false;
    }

    // Close existing driver
    if (driver) {
      await driver.close();
    }

    driver = neo4j.driver(finalUri, neo4j.auth.basic(finalUsername, finalPassword), {
      maxConnectionLifetime: 3 * 60 * 1000,
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 10 * 1000,
      disableLosslessIntegers: true,
    });

    try {
      await driver.verifyConnectivity();
      return true;
    } catch (error: any) {
      // If we used stored credentials and they failed, try env variables directly as fallback
      if (uri || username || password) {
        const envUri = process.env.EXPO_PUBLIC_NEO4J_URI || null;
        const envUsername = process.env.EXPO_PUBLIC_NEO4J_USERNAME || null;
        const envPassword = process.env.EXPO_PUBLIC_NEO4J_PASSWORD || null;

        if (
          envUri && envUsername && envPassword &&
          (envUri !== finalUri || envUsername !== finalUsername || envPassword !== finalPassword)
        ) {
          console.warn('Stored Neo4j connection failed. Trying environment variables fallback...');
          const fallbackDriver = neo4j.driver(envUri, neo4j.auth.basic(envUsername, envPassword), {
            maxConnectionLifetime: 3 * 60 * 1000,
            maxConnectionPoolSize: 10,
            connectionAcquisitionTimeout: 10 * 1000,
            disableLosslessIntegers: true,
          });
          try {
            await fallbackDriver.verifyConnectivity();
            // Success! Store the working env credentials
            driver = fallbackDriver;
            await setStoredValue('neo4j_uri', envUri);
            await setStoredValue('neo4j_username', envUsername);
            await setStoredValue('neo4j_password', envPassword);
            console.log('Self-healed: Updated Neo4j storage credentials to working env credentials.');
            return true;
          } catch {
            await fallbackDriver.close();
          }
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Neo4j init failed:', error);
    return false;
  }
}

/**
 * Get a session from the driver. Auto-initializes if needed.
 */
async function getSession(): Promise<Session> {
  if (!driver) {
    const ok = await initNeo4j();
    if (!ok || !driver) {
      throw new Error('Neo4j not connected. Please configure credentials in Settings.');
    }
  }
  return driver.session();
}

/**
 * Run a read query with parameters.
 */
export async function readQuery(
  cypher: string,
  params: Record<string, any> = {}
): Promise<Neo4jRecord[]> {
  const session = await getSession();
  try {
    const result = await session.readTransaction(tx => tx.run(cypher, params));
    return result.records;
  } finally {
    await session.close();
  }
}

/**
 * Run a write query with parameters.
 */
export async function writeQuery(
  cypher: string,
  params: Record<string, any> = {}
): Promise<Neo4jRecord[]> {
  const session = await getSession();
  try {
    const result = await session.writeTransaction(tx => tx.run(cypher, params));
    return result.records;
  } finally {
    await session.close();
  }
}

/**
 * Run multiple queries in a single transaction
 */
export async function writeTransaction(
  queries: Array<{ cypher: string; params: Record<string, any> }>
): Promise<void> {
  const session = await getSession();
  try {
    await session.writeTransaction(async tx => {
      for (const q of queries) {
        await tx.run(q.cypher, q.params);
      }
    });
  } finally {
    await session.close();
  }
}

/**
 * Test connection — returns true if connected
 */
export async function testConnection(): Promise<boolean> {
  try {
    if (!driver) {
      return await initNeo4j();
    }
    await driver.verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close the driver
 */
export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Remove a student and owned learning subgraph (best-effort per known labels).
 */
export async function deleteStudentCascade(studentId: string): Promise<void> {
  const steps = [
    `MATCH (:Student {id:$studentId})-[:ATTEMPTED]->(n:Quiz) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_RELATIONSHIP]->(n:SubjectRelationship) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_EXAM]->(n:Exam) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:STUDIED]->(n:StudySession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:LOGGED_MOOD]->(n:MoodLog) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:SUBMITTED]->(n:AnswerSubmission) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:TOOK_DIAGNOSTIC]->(:DiagnosticRun)-[:HAS_ATTEMPT]->(a:DiagnosticAttempt) DETACH DELETE a`,
    `MATCH (:Student {id:$studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun) DETACH DELETE r`,
    `MATCH (:Student {id:$studentId})-[:HAS_STUDY_PLAN]->(n:StudyPlan) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:LOGGED_DOUBT]->(n:DoubtSession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_TIMETABLE_SLOT]->(n:TimetableSlot) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:COMPLETED_REVIEW]->(n:ReviewSession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:TOOK_BASELINE]->(n:BaselineTest) DETACH DELETE n`,
    `MATCH (s:Student {id:$studentId}) DETACH DELETE s`,
  ];
  for (const cypher of steps) {
    await writeQuery(cypher, { studentId });
  }
}
