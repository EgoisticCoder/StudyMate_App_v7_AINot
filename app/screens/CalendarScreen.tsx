// MONTHLY CALENDAR — Shows events and timetable slots
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Platform, Animated, Easing } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { readQuery, writeQuery } from '../../lib/neo4j';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';
import { SectionLabel, PrimaryButton, AnimatedScreenWrapper } from '../../components/ui/premium';
import { v4 as uuidv4 } from 'uuid';

interface CalendarEvent {
  id: string;
  title: string;
  type: 'event' | 'reminder';
  date: string; // YYYY-MM-DD
}

interface TimetableSlotInfo {
  subject: string;
  title: string;
  time_slot: string;
}

export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<Record<string, TimetableSlotInfo[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<'event'|'reminder'>('event');

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay(); // 0 is Sunday
  };

  const loadData = async () => {
    if (!studentId) return;
    try {
      // Load custom events for this month
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();
      
      const eventRes = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:HAS_EVENT]->(e:CalendarEvent)
         WHERE e.date >= $start AND e.date <= $end
         RETURN e.id AS id, e.title AS title, e.type AS type, e.date AS date`,
        { studentId, start: startOfMonth, end: endOfMonth }
      );
      setEvents(eventRes.map(r => ({
        id: r.get('id'), title: r.get('title'), type: r.get('type'), date: r.get('date').split('T')[0]
      })));

      // Load timetable template to map to days
      const ttRes = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:HAS_TIMETABLE_SLOT]->(slot:TimetableSlot)
         RETURN slot.day_index AS di, slot.subject AS sub, slot.title AS title, slot.time_slot AS ts`,
        { studentId }
      );
      
      const mappedSlots: Record<string, TimetableSlotInfo[]> = {};
      const daysInMonth = getDaysInMonth(currentDate);
      const slotsList = ttRes.map(r => ({
        day_index: Number(r.get('di')), subject: r.get('sub'), title: r.get('title'), time_slot: r.get('ts')
      }));

      // Map weekly template onto the month's dates
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
        const dayOfWeek = (d.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
        const dateStr = d.toISOString().split('T')[0];
        
        const daySlots = slotsList.filter(s => s.day_index === dayOfWeek);
        if (daySlots.length > 0) {
          mappedSlots[dateStr] = daySlots.map(s => ({
            subject: s.subject, title: s.title, time_slot: s.time_slot
          }));
        }
      }
      setTimetableSlots(mappedSlots);
    } catch (e) {
      console.error("Calendar fetch error", e);
    }
  };

  useEffect(() => { loadData(); }, [studentId, currentDate]);

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleAddEvent = async () => {
    if (!selectedDate || !newEventTitle.trim()) return;
    const isoDate = new Date(selectedDate).toISOString();
    try {
      const id = uuidv4();
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (e:CalendarEvent {id: $id, title: $title, type: $type, date: $date})
         CREATE (s)-[:HAS_EVENT]->(e)`,
        { studentId, id, title: newEventTitle, type: newEventType, date: isoDate }
      );
      setAddModal(false);
      setNewEventTitle('');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const renderGrid = () => {
    const days = getDaysInMonth(currentDate);
    let firstDay = getFirstDayOfMonth(currentDate) - 1; // Start Monday
    if (firstDay === -1) firstDay = 6; // Sunday is 6

    const grid = [];
    let week = [];
    
    for (let i = 0; i < firstDay; i++) {
      week.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    for (let i = 1; i <= days; i++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      const dateStr = d.toISOString().split('T')[0];
      const hasEvents = events.some(e => e.date === dateStr);
      const hasTimetable = !!timetableSlots[dateStr];
      const isSelected = selectedDate === dateStr;
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      week.push(
        <TouchableOpacity 
          key={i} 
          style={[
            styles.dayCell, 
            isSelected && { backgroundColor: colors.accentMuted, borderColor: colors.accentBorder }
          ]}
          onPress={() => setSelectedDate(dateStr)}
        >
          <View style={[
            styles.dayCircle, 
            isToday && { backgroundColor: colors.accent }
          ]}>
            <Text 
              style={[
                styles.dayText, 
                { color: isToday ? colors.textInverse : colors.textPrimary, fontFamily: Fonts.bodyMedium }
              ]}
            >
              {i}
            </Text>
          </View>
          <View style={styles.dotRow}>
            {hasTimetable && <View style={[styles.dot, { backgroundColor: colors.success }]} />}
            {hasEvents && <View style={[styles.dot, { backgroundColor: colors.warning }]} />}
          </View>
        </TouchableOpacity>
      );

      if (week.length === 7) {
        grid.push(<View key={`week-${i}`} style={styles.weekRow}>{week}</View>);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) week.push(<View key={`empty-end-${week.length}`} style={styles.dayCell} />);
      grid.push(<View key={`week-end`} style={styles.weekRow}>{week}</View>);
    }

    return grid;
  };

  const selectedEvents = events.filter(e => e.date === selectedDate);
  const selectedTimetable = selectedDate ? timetableSlots[selectedDate] || [] : [];

  return (
    <AnimatedScreenWrapper style={{ backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Calendar</Text>
        <TouchableOpacity 
          onPress={() => { if(selectedDate) setAddModal(true); }}
          disabled={!selectedDate}
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1, opacity: selectedDate ? 1 : 0.4 }]}
        >
          <Ionicons name="add" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.calendarCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          <View style={styles.monthHeader}>
            <TouchableOpacity onPress={handlePrevMonth}>
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={handleNextMonth}>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.weekRow}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Text key={i} style={[styles.dayHeaderCell, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>{d}</Text>
            ))}
          </View>
          
          {renderGrid()}
        </View>

        {selectedDate && (
          <View style={styles.detailsArea}>
            <Text style={[styles.detailsTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              {new Date(selectedDate).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>

            {selectedEvents.length === 0 && selectedTimetable.length === 0 ? (
              <Text style={{ color: colors.textTertiary, fontFamily: Fonts.body, marginTop: 12 }}>
                No schedule for this day.
              </Text>
            ) : (
              <>
                {selectedEvents.length > 0 && (
                  <View style={{ marginTop: 20 }}>
                    <SectionLabel text="Events & Reminders" style={{ marginBottom: 10 }} />
                    {selectedEvents.map(e => {
                      const leftBorderColor = e.type === 'reminder' ? colors.warning : colors.accent;
                      return (
                        <View key={e.id} style={styles.eventCardOuter}>
                          <View style={[styles.eventCardInner, { borderLeftColor: leftBorderColor }]}>
                            <Ionicons 
                              name={e.type === 'reminder' ? "notifications-outline" : "calendar-outline"} 
                              size={16} 
                              color={leftBorderColor} 
                            />
                            <Text style={{ color: colors.textPrimary, fontFamily: Fonts.bodyMedium, fontSize: 14, marginLeft: 10 }}>
                              {e.title}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {selectedTimetable.length > 0 && (
                  <View style={{ marginTop: 20 }}>
                    <SectionLabel text="Timetable" style={{ marginBottom: 10 }} />
                    {selectedTimetable.map((t, i) => (
                      <View 
                        key={i} 
                        style={[
                          styles.ttCard, 
                          { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }
                        ]}
                      >
                        <Text style={{ color: colors.textTertiary, fontFamily: Fonts.bodyMedium, fontSize: 12, width: 90 }}>
                          {t.time_slot}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.textPrimary, fontFamily: Fonts.displayMedium, fontSize: 14 }}>
                            {t.subject}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontFamily: Fonts.body, fontSize: 12, marginTop: 2 }}>
                            {t.title}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Event Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface3, borderTopColor: colors.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                Add to {selectedDate}
              </Text>
              <TouchableOpacity 
                onPress={() => setAddModal(false)}
                style={[styles.closeBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.typeRow}>
              <TouchableOpacity 
                onPress={() => setNewEventType('event')} 
                style={[
                  styles.typeBtn, 
                  { 
                    backgroundColor: newEventType === 'event' ? colors.accentMuted : colors.surface1,
                    borderColor: newEventType === 'event' ? colors.accentBorder : colors.borderSubtle,
                  }
                ]}
              >
                <Text style={{ color: newEventType === 'event' ? colors.accentHover : colors.textSecondary, fontFamily: Fonts.bodyMedium }}>Event</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => setNewEventType('reminder')} 
                style={[
                  styles.typeBtn, 
                  { 
                    backgroundColor: newEventType === 'reminder' ? colors.warning + '0c' : colors.surface1,
                    borderColor: newEventType === 'reminder' ? colors.warning + '20' : colors.borderSubtle,
                  }
                ]}
              >
                <Text style={{ color: newEventType === 'reminder' ? colors.warning : colors.textSecondary, fontFamily: Fonts.bodyMedium }}>Reminder</Text>
              </TouchableOpacity>
            </View>

            <TextInput 
              style={[
                styles.input, 
                { 
                  color: colors.textPrimary, 
                  borderColor: colors.borderSubtle, 
                  backgroundColor: colors.surface1,
                  fontFamily: Fonts.body,
                }
              ]}
              placeholder="e.g. Math Test, or Doctor's Appointment"
              placeholderTextColor={colors.textTertiary}
              value={newEventTitle}
              onChangeText={setNewEventTitle}
              autoFocus
            />
            
            <PrimaryButton 
              label="Save" 
              onPress={handleAddEvent}
              disabled={!newEventTitle.trim()}
            />
          </View>
        </View>
      </Modal>
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    paddingTop: Platform.OS === 'ios' ? 60 : 40, 
    paddingBottom: 16, 
    paddingHorizontal: 20, 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    alignItems: 'center' 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, letterSpacing: -0.4 },
  calendarCard: { 
    margin: 20, 
    padding: 16, 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth 
  },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  monthTitle: { fontSize: 15 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayHeaderCell: { flex: 1, textAlign: 'center', fontSize: 12, marginBottom: 8 },
  dayCell: { 
    flex: 1, 
    height: 48, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderRadius: 8, 
    borderWidth: StyleSheet.hairlineWidth, 
    borderColor: 'transparent' 
  },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14 },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  detailsArea: { paddingHorizontal: 20, paddingBottom: 40 },
  detailsTitle: { fontSize: 18, letterSpacing: -0.4 },
  eventCardOuter: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.055)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  eventCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderLeftWidth: 4,
  },
  ttCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 14, 
    borderRadius: Radii.card, 
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8 
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,9,12,0.5)' },
  modalCard: { 
    padding: 24, 
    paddingBottom: Platform.OS === 'ios' ? 44 : 24, 
    borderTopLeftRadius: Radii.bottomSheet, 
    borderTopRightRadius: Radii.bottomSheet,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { 
    flex: 1, 
    paddingVertical: 10, 
    alignItems: 'center', 
    borderRadius: Radii.input,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { 
    borderWidth: StyleSheet.hairlineWidth, 
    borderRadius: Radii.input, 
    padding: 14, 
    fontSize: 15, 
    marginBottom: 20 
  },
});
