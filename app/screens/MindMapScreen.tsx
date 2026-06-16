import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Dimensions
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../lib/context';
import { getNotes, Note } from '../../lib/notesDB';
import { callGroq, parseGroqJSON } from '../../lib/ai';
import { Fonts } from '../../constants/fonts';
import { Radii } from '../../constants/colors';
import { AnimatedScreenWrapper } from '../../components/ui/premium';

interface MindMapNode {
  id: string;
  name: string;
  level: number;
  parentId?: string;
  children?: MindMapNode[];
  collapsed?: boolean;
}

// Raw JSON response interface from Groq
interface RawNode {
  name: string;
  children?: RawNode[];
}

export default function MindMapScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ noteId?: string; noteText?: string; title?: string }>();

  const [loading, setLoading] = useState(false);
  const [notesList, setNotesList] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState(params.noteId || '');
  
  // Mindmap nodes representation
  const [treeData, setTreeData] = useState<MindMapNode | null>(null);

  useEffect(() => {
    (async () => {
      const allNotes = await getNotes();
      setNotesList(allNotes);

      // If noteText was passed via navigation, generate immediately
      if (params.noteText) {
        generateMindMap(params.noteText, params.title || 'Study Note');
      } else if (allNotes.length > 0) {
        // Default select first note
        setSelectedNoteId(allNotes[0].id);
      }
    })();
  }, [params.noteId]);

  // Recursively add IDs, levels, parentIds and initial collapse state to raw nodes
  const prepareTree = (node: RawNode, level = 0, parentId?: string): MindMapNode => {
    const id = Math.random().toString(36).substring(2, 9);
    const prepared: MindMapNode = {
      id,
      name: node.name,
      level,
      parentId,
      collapsed: level >= 2 // Collapse deeply nested levels by default
    };

    if (node.children && node.children.length > 0) {
      prepared.children = node.children.map(child => prepareTree(child, level + 1, id));
    }

    return prepared;
  };

  const generateMindMap = async (text: string, title: string) => {
    setLoading(true);
    try {
      const sysPrompt = `You are a helpful education AI that parses text notes into clean, structured mind maps.
You must construct a logical hierarchy of topics, key points, concepts, formulas, or facts.
Return ONLY a valid JSON object matching the RawNode interface. Do not wrap in markdown codeblocks. Do not explain anything.

JSON format:
{
  "name": "Main Note Subject/Title",
  "children": [
    {
      "name": "Major Concept 1",
      "children": [
        { "name": "Key details/formulas/definition 1" },
        { "name": "Key details/formulas/definition 2" }
      ]
    },
    {
      "name": "Major Concept 2",
      "children": [
        { "name": "Subtopic details 1" }
      ]
    }
  ]
}`;

      const prompt = `Generate a structured study mind map hierarchy for the notes titled "${title}".
Notes Content:
"""
${text}
"""`;

      const response = await callGroq(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: prompt }
        ],
        'quiz_generator' // Reuse low temperature usecase
      );

      const parsed = parseGroqJSON<RawNode>(response);
      const tree = prepareTree(parsed);
      setTreeData(tree);
    } catch (e: any) {
      console.error(e);
      Alert.alert('AI Error', 'Failed to generate mind map. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
    const note = notesList.find(n => n.id === id);
    if (note) {
      generateMindMap(note.transcription, note.chapter);
    }
  };

  // Toggle node collapse state recursively
  const toggleCollapse = (node: MindMapNode, targetId: string): MindMapNode => {
    if (node.id === targetId) {
      return { ...node, collapsed: !node.collapsed };
    }
    if (node.children) {
      return {
        ...node,
        children: node.children.map(child => toggleCollapse(child, targetId))
      };
    }
    return node;
  };

  const handleNodePress = (nodeId: string) => {
    if (!treeData) return;
    setTreeData(prev => prev ? toggleCollapse(prev, nodeId) : null);
  };

  // Flatten the visible nodes in layout order (DFS traversal)
  const flattenVisible = (node: MindMapNode, result: MindMapNode[] = []): MindMapNode[] => {
    result.push(node);
    if (!node.collapsed && node.children) {
      node.children.forEach(child => flattenVisible(child, result));
    }
    return result;
  };

  // Layout calculations
  const visibleNodes = treeData ? flattenVisible(treeData) : [];
  const itemHeight = 64;
  const nodeWidth = 180;
  const levelGap = 240;

  // Node styles
  const getNodeColor = (level: number) => {
    switch (level) {
      case 0: return colors.accent;
      case 1: return colors.info;
      case 2: return colors.success;
      default: return colors.surface3;
    }
  };

  return (
    <AnimatedScreenWrapper style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.headerArea}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={[styles.backBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          AI Mind Map
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Select Note Selector (if not navigated from viewer) */}
      {!params.noteText && notesList.length > 0 && (
        <View style={styles.selectorContainer}>
          <Text style={[styles.selectorLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
            Select Note:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
            {notesList.map(n => (
              <TouchableOpacity
                key={n.id}
                onPress={() => handleSelectNote(n.id)}
                style={[
                  styles.selectChip,
                  {
                    backgroundColor: selectedNoteId === n.id ? colors.accentMuted : colors.surface1,
                    borderColor: selectedNoteId === n.id ? colors.accentBorder : colors.borderSubtle
                  }
                ]}
              >
                <Text style={{ 
                  color: selectedNoteId === n.id ? colors.accentHover : colors.textSecondary,
                  fontSize: 12,
                  fontFamily: Fonts.bodyMedium
                }}>
                  {n.subject} • {n.chapter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12 }}>
            Mapping study points...
          </Text>
        </View>
      ) : !treeData ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="git-network-outline" size={64} color={colors.textTertiary} />
          <Text style={{ color: colors.textSecondary, fontFamily: Fonts.bodyMedium, marginTop: 12 }}>
            No Mind Map Active
          </Text>
          <Text style={{ color: colors.textTertiary, fontFamily: Fonts.body, fontSize: 13, marginTop: 4 }}>
            Please select a note or upload one first to view a mind map.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}>
          {/* Scrollable Map Container */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={{ 
              width: Math.max(Dimensions.get('window').width, (treeData.level + 3) * levelGap),
              height: Math.max(500, visibleNodes.length * itemHeight + 100),
              position: 'relative'
            }}
          >
            {/* SVG Link lines between nodes */}
            <Svg style={StyleSheet.absoluteFill}>
              {visibleNodes.map(node => {
                if (node.parentId) {
                  // Find index of self and parent to get Y coords
                  const selfIdx = visibleNodes.findIndex(n => n.id === node.id);
                  const parentIdx = visibleNodes.findIndex(n => n.id === node.parentId);
                  
                  if (selfIdx !== -1 && parentIdx !== -1) {
                    const startX = (node.level - 1) * levelGap + nodeWidth;
                    const startY = parentIdx * itemHeight + 40;
                    const endX = node.level * levelGap;
                    const endY = selfIdx * itemHeight + 40;
                    
                    // Curved cubic Bezier path
                    const controlX = startX + (endX - startX) / 2;
                    const path = `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
                    
                    return (
                      <Path
                        key={`link-${node.id}`}
                        d={path}
                        fill="none"
                        stroke={getNodeColor(node.level - 1)}
                        strokeWidth={1.5}
                        opacity={0.6}
                      />
                    );
                  }
                }
                return null;
              })}
            </Svg>

            {/* Nodes Render list */}
            {visibleNodes.map((node, index) => {
              const nodeX = node.level * levelGap;
              const nodeY = index * itemHeight + 20; // 20px padding top
              const isParent = node.children && node.children.length > 0;
              const themeColor = getNodeColor(node.level);

              return (
                <TouchableOpacity
                  key={node.id}
                  activeOpacity={0.8}
                  onPress={() => isParent && handleNodePress(node.id)}
                  style={[
                    styles.nodeBox,
                    {
                      left: nodeX,
                      top: nodeY,
                      width: nodeWidth,
                      backgroundColor: colors.surface1,
                      borderColor: themeColor,
                      borderLeftWidth: 4,
                    }
                  ]}
                >
                  <Text 
                    numberOfLines={2} 
                    style={[styles.nodeText, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}
                  >
                    {node.name}
                  </Text>
                  
                  {isParent && (
                    <Ionicons
                      name={node.collapsed ? 'chevron-down' : 'chevron-up'}
                      size={14}
                      color={colors.textTertiary}
                      style={styles.collapseIcon}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </ScrollView>
      )}
    </AnimatedScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  headerArea: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    marginBottom: 8 
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, letterSpacing: -0.4, fontWeight: '600' },
  selectorContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  selectorLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  selectorScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  selectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nodeBox: {
    position: 'absolute',
    height: 48,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingHorizontal: 10,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  nodeText: {
    fontSize: 11.5,
    lineHeight: 15,
    paddingRight: 12,
  },
  collapseIcon: {
    position: 'absolute',
    right: 4,
    alignSelf: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
});
