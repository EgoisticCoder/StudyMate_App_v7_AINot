// WeeklyTimetableCard — Clean editable grid with colors, custom time ranges, +/- controls
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  Modal, Alert, Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/context';
import { loadSlotsForWeek, setSlotDone, updateSlotNote, updateSlot, TimetableSlotRow } from '../lib/timetableSlots';
import { writeQuery, readQuery } from '../lib/neo4j';
import { weekKeyFromDate } from '../lib/weekUtils';
import { SubjectColors } from '../constants/colors';
import { v4 as uuidv4 } from 'uuid';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SCREEN_W = Dimensions.get('window').width;

// Default 5 time rows
const DEFAULT_ROWS = [
  '09:00 - 10:00',
  '10:00 - 11:00',
  '11:00 - 12:00',
  '14:00 - 15:00',
  '16:00 - 17:00',
];

function getSubjectColor(subject: string, isDark: boolean): string {
  const entry = SubjectColors[subject];
  if (entry) return isDark ? entry.dark : entry.light;
  // Fallback: hash-based color
  const FALLBACK = ['#818CF8', '#F472B6', '#34D399', '#FB923C', '#60A5FA', '#FBBF24', '#A78BFA', '#38BDF8'];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = subject.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK[Math.abs(hash) % FALLBACK.length];
}

interface Props {
  studentId: string;
  reloadTick?: number;
}

export function WeeklyTimetableCard({ studentId, reloadTick = 0 }: Props) {
  const { colors, isDark } = useTheme();
  const [slots, setSlots] = useState<TimetableSlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRows, setTimeRows] = useState<string[]>(DEFAULT_ROWS);
  const [editModal, setEditModal] = useState<{ dayIndex: number; timeRange: string; slot?: TimetableSlotRow } | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [addTimeModal, setAddTimeModal] = useState(false);
  const [newTimeStart, setNewTimeStart] = useState('');
  const [newTimeEnd, setNewTimeEnd] = useState('');

  const weekKey = weekKeyFromDate();

  const fetchSlots = useCallback(async () => {
    try {
      const data = await loadSlotsForWeek(studentId, weekKey);
      setSlots(data);
      // Derive time rows from loaded data
      if (data.length > 0) {
        const timeSet = new Set<string>();
        data.forEach(s => { if (s.time_slot) timeSet.add(s.time_slot); });
        if (timeSet.size > 0) {
          const sorted = Array.from(timeSet).sort();
          setTimeRows(sorted);
        }
      }
    } catch (err) { console.error('Failed to load slots:', err); }
    finally { setLoading(false); }
  }, [studentId, weekKey]);

  useEffect(() => { fetchSlots(); }, [fetchSlots, reloadTick]);

  const getSlot = (dayIndex: number, timeRange: string): TimetableSlotRow | undefined => {
    return slots.find(s => s.day_index === dayIndex && s.time_slot === timeRange);
  };

  const handleCellPress = (dayIndex: number, timeRange: string) => {
    const slot = getSlot(dayIndex, timeRange);
    setEditModal({ dayIndex, timeRange, slot });
    setEditSubject(slot?.subject || '');
    setEditTitle(slot?.title || '');
    setEditNote(slot?.sticky_note || '');
  };

  const handleToggleDone = async (slot: TimetableSlotRow) => {
    const newDone = !slot.done;
    await setSlotDone(studentId, slot.id, newDone);
    setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, done: newDone } : s));
  };

  const handleSaveCell = async () => {
    if (!editModal) return;
    const { dayIndex, timeRange, slot } = editModal;
    if (slot) {
      // Update existing
      await updateSlot(studentId, slot.id, { title: editTitle, subject: editSubject, time_slot: timeRange });
      if (editNote !== slot.sticky_note) await updateSlotNote(studentId, slot.id, editNote);
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, title: editTitle, subject: editSubject, sticky_note: editNote } : s));
    } else if (editSubject.trim() || editTitle.trim()) {
      // Create new slot
      const id = uuidv4();
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (slot:TimetableSlot {
           id: $id, week_start: $wk, day_index: $di, day_name: $dn,
           slot_order: $order, title: $title, minutes_estimate: 60,
           done: false, created_at: datetime(), time_slot: $ts,
           subject: $subject, sticky_note: $note
         })
         CREATE (s)-[:HAS_TIMETABLE_SLOT]->(slot)`,
        { studentId, id, wk: weekKey, di: dayIndex, dn: dayNames[dayIndex], order: timeRows.indexOf(timeRange), title: editTitle, ts: timeRange, subject: editSubject, note: editNote }
      );
      setSlots(prev => [...prev, { id, week_start: weekKey, day_index: dayIndex, day_name: dayNames[dayIndex], slot_order: timeRows.indexOf(timeRange), title: editTitle, minutes_estimate: 60, done: false, time_slot: timeRange, subject: editSubject, sticky_note: editNote }]);
    }
    setEditModal(null);
  };

  const handleDeleteCell = async () => {
    if (!editModal?.slot) return;
    await writeQuery(`MATCH (slot:TimetableSlot {id: $id}) DETACH DELETE slot`, { id: editModal.slot.id });
    setSlots(prev => prev.filter(s => s.id !== editModal.slot!.id));
    setEditModal(null);
  };

  const handleAddTimeRow = () => {
    if (!newTimeStart.trim() || !newTimeEnd.trim()) { Alert.alert('Invalid', 'Enter both start and end time.'); return; }
    const range = `${newTimeStart.trim()} - ${newTimeEnd.trim()}`;
    if (timeRows.includes(range)) { Alert.alert('Exists', 'This time range already exists.'); return; }
    setTimeRows(prev => [...prev, range].sort());
    setAddTimeModal(false);
    setNewTimeStart('');
    setNewTimeEnd('');
  };

  const handleRemoveTimeRow = (range: string) => {
    const slotsInRow = slots.filter(s => s.time_slot === range);
    if (slotsInRow.length > 0) {
      Alert.alert('Remove Row', 'This will remove all slots in this time period. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          for (const s of slotsInRow) {
            await writeQuery(`MATCH (slot:TimetableSlot {id: $id}) DETACH DELETE slot`, { id: s.id });
          }
          setSlots(prev => prev.filter(s => s.time_slot !== range));
          setTimeRows(prev => prev.filter(r => r !== range));
        }},
      ]);
    } else {
      setTimeRows(prev => prev.filter(r => r !== range));
    }
  };

  // Compute cell width
  const PADDING = 16;
  const TIME_W = 70;
  const AVAIL = SCREEN_W - PADDING * 2 - TIME_W;
  const CELL_W = Math.floor(AVAIL / 7);
  const ROW_H = 56;

  if (loading) return null;
  if (slots.length === 0 && timeRows.length === DEFAULT_ROWS.length) return null; // Don't show if no timetable at all

  return (
    <View style={{ marginHorizontal: PADDING, marginTop: 16 }}>
      <View style={st.headerRow}>
        <Text style={[st.sectionTitle, { color: colors.text }]}>Weekly Timetable</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => setAddTimeModal(true)} style={[st.addBtn, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>Row</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[st.gridContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
          <View>
            {/* Day headers */}
            <View style={st.dayHeaderRow}>
              <View style={[st.timeCell, { width: TIME_W }]} />
              {DAYS.map((d, i) => (
                <View key={i} style={[st.dayHeader, { width: CELL_W, borderLeftColor: colors.border }]}>
                  <Text style={[st.dayText, { color: colors.primary }]}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Time rows */}
            {timeRows.map((timeRange, ri) => (
              <View key={timeRange} style={[st.row, { borderTopColor: colors.border }]}>
                <TouchableOpacity onLongPress={() => handleRemoveTimeRow(timeRange)} style={[st.timeCell, { width: TIME_W }]}>
                  <Text style={[st.timeText, { color: colors.textTertiary }]} numberOfLines={2}>
                    {timeRange.replace(' - ', '\n')}
                  </Text>
                </TouchableOpacity>
                {DAYS.map((_, di) => {
                  const slot = getSlot(di, timeRange);
                  if (!slot) {
                    return (
                      <TouchableOpacity key={di} style={[st.cell, { width: CELL_W, height: ROW_H, borderLeftColor: colors.border }]} onPress={() => handleCellPress(di, timeRange)}>
                        <Ionicons name="add" size={14} color={colors.textTertiary + '40'} />
                      </TouchableOpacity>
                    );
                  }
                  const subColor = getSubjectColor(slot.subject, isDark);
                  return (
                    <TouchableOpacity
                      key={di}
                      style={[st.cell, { width: CELL_W, height: ROW_H, borderLeftColor: colors.border, backgroundColor: subColor + '18' }]}
                      onPress={() => handleCellPress(di, timeRange)}
                      onLongPress={() => handleToggleDone(slot)}
                      // @ts-ignore
                      onContextMenu={(e: any) => { if (Platform.OS === 'web') { e.preventDefault(); handleCellPress(di, timeRange); } }}
                    >
                      {slot.done && (
                        <View style={[st.doneBadge, { backgroundColor: '#059669' }]}>
                          <Ionicons name="checkmark" size={8} color="#FFF" />
                        </View>
                      )}
                      <Text style={[st.cellSubject, { color: subColor }]} numberOfLines={1}>{slot.subject?.substring(0, 6) || ''}</Text>
                      <Text style={[st.cellTitle, { color: colors.text }]} numberOfLines={2}>{slot.title}</Text>
                      {slot.sticky_note ? <Ionicons name="document-text" size={8} color={colors.textTertiary} style={{ marginTop: 1 }} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Edit Cell Modal */}
      <Modal visible={!!editModal} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: colors.surface }]}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: colors.text }]}>{editModal?.slot ? 'Edit Slot' : 'Add Slot'}</Text>
              <TouchableOpacity onPress={() => setEditModal(null)}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={[st.modalLabel, { color: colors.textTertiary }]}>
              {DAYS[editModal?.dayIndex || 0]} · {editModal?.timeRange}
            </Text>

            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Subject</Text>
            <TextInput style={[st.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={editSubject} onChangeText={setEditSubject} placeholder="e.g. Mathematics" placeholderTextColor={colors.textTertiary} />

            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Topic / Chapter</Text>
            <TextInput style={[st.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={editTitle} onChangeText={setEditTitle} placeholder="e.g. Quadratic Equations" placeholderTextColor={colors.textTertiary} />

            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Notes</Text>
            <TextInput style={[st.input, st.multiInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={editNote} onChangeText={setEditNote} placeholder="Any notes..." placeholderTextColor={colors.textTertiary} multiline />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {editModal?.slot && (
                <TouchableOpacity style={[st.deleteBtn, { borderColor: '#EF4444' }]} onPress={handleDeleteCell}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[st.saveBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={handleSaveCell}>
                <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 15 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Time Row Modal */}
      <Modal visible={addTimeModal} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: colors.surface }]}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: colors.text }]}>Add Time Period</Text>
              <TouchableOpacity onPress={() => setAddTimeModal(false)}>
                <Ionicons name="close" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Start Time</Text>
            <TextInput style={[st.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={newTimeStart} onChangeText={setNewTimeStart} placeholder="e.g. 10:30" placeholderTextColor={colors.textTertiary} keyboardType="default" />
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>End Time</Text>
            <TextInput style={[st.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]} value={newTimeEnd} onChangeText={setNewTimeEnd} placeholder="e.g. 11:30" placeholderTextColor={colors.textTertiary} keyboardType="default" />
            <TouchableOpacity style={[st.saveBtn, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={handleAddTimeRow}>
              <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 15 }}>Add Row</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  gridContainer: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  dayHeaderRow: { flexDirection: 'row' },
  dayHeader: { paddingVertical: 10, alignItems: 'center', borderLeftWidth: StyleSheet.hairlineWidth },
  dayText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  row: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  timeCell: { paddingVertical: 6, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center' },
  timeText: { fontSize: 9, fontWeight: '600', textAlign: 'center', lineHeight: 13 },
  cell: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2, paddingVertical: 4, borderLeftWidth: StyleSheet.hairlineWidth },
  doneBadge: { position: 'absolute', top: 2, right: 2, width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cellSubject: { fontSize: 8, fontWeight: '700', letterSpacing: 0.3 },
  cellTitle: { fontSize: 9, textAlign: 'center', lineHeight: 12, marginTop: 1 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalLabel: { fontSize: 13, fontWeight: '500', marginBottom: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  multiInput: { minHeight: 60, textAlignVertical: 'top' },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  deleteBtn: { width: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
