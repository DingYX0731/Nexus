import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, FlatList, TextInput,
  Platform, Keyboard, ScrollView, Dimensions,
  type ListRenderItemInfo, type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Heart, X, MessageCircle, CornerDownRight, Smile,
  Mic, ImageIcon, AtSign, Plus, Delete,
} from 'lucide-react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { useComments, type Comment } from '@/store/comments';
import { useAuth } from '@/store/auth';
import { showAuthRequired } from '@/components/dialog/ConfirmDialog';
import { useRouter } from 'expo-router';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.78;

const EMOJIS = [
  '😂', '🥰', '😍', '🤔', '😭', '👍', '👀', '🔥',
  '✨', '💯', '🎉', '❤️', '😅', '🙌', '🤩', '👏',
  '🥺', '😆', '💖', '🎬', '😎', '🙏', '👌', '💪',
  '🤣', '😇', '🥹', '😋', '🤗', '🫶', '😊', '😘',
  '🤤', '🥳', '😏', '🙃', '🫠', '😴', '🤯', '😱',
  '😡', '🤬', '😢', '😩', '😤', '🤧', '😷', '🤒',
  '🤡', '👻', '💩', '🎂', '🎁', '🌟', '💫', '🌈',
  '☀️', '🌙', '⭐', '☁️', '⚡', '❄️', '💧', '🌊',
  '🍀', '🌸', '🌺', '🌹', '🍎', '🍊', '🍋', '🍌',
  '🍉', '🍓', '🍒', '🥑', '🍕', '🍔', '🍣', '🍰',
];

const EMOJI_COLUMNS = 8;
const EMOJI_PANEL_HEIGHT_DEFAULT = 280;

interface Props {
  videoId: string;
  visible: boolean;
  onClose: () => void;
}

export function CommentsSheet({ videoId, visible, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ensureSeeded = useComments((s) => s.ensureSeeded);
  const addComment = useComments((s) => s.add);
  const toggleLike = useComments((s) => s.toggleLike);
  const comments = useComments((s) => s.byVideo[videoId]) ?? [];
  const { user } = useAuth();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [lastKnownKeyboardHeight, setLastKnownKeyboardHeight] = useState(280);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Comment>>(null);

  const translateY = useSharedValue(SHEET_HEIGHT + 50);

  // 关键:监听键盘事件,得到真实键盘高度
  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      const h = e.endCoordinates?.height ?? 0;
      if (h > 0) {
        setKeyboardHeight(h);
        setLastKnownKeyboardHeight(h);
      }
    };
    const onHide = () => {
      setKeyboardHeight(0);
    };
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      ensureSeeded(videoId);
      translateY.value = withSpring(0, { damping: 18, stiffness: 160, mass: 0.9 });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT + 50, { duration: 220 });
      setDraft('');
      setReplyTo(null);
      setEmojiOpen(false);
    }
  }, [visible, ensureSeeded, videoId, translateY]);

  const close = useCallback(() => {
    Keyboard.dismiss();
    translateY.value = withTiming(SHEET_HEIGHT + 50, { duration: 220 }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [onClose, translateY]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 140 || e.velocityY > 800) {
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 160 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // 键盘弹起时,把整个 Sheet 上移 keyboardHeight,这样 Sheet 底端贴键盘上沿,
  // composer 自然在键盘上方,不会被 sheet overflow:'hidden' 裁掉。
  // emoji 打开时同理,移上 emoji 面板高度。
  //
  // ⚠️ KEYBOARD_LIFT_BUFFER:不同 Android 设备 / 不同输入法,keyboardHeight 事件值
  // 可能比真实键盘上沿低 10-30px(尤其是异形屏 + 手势导航的真机,比如 vivo X300 Pro)。
  // 加一个 buffer 让 sheet 多上移一点,确保 composer 完全在键盘上方,不被擦掉。
  // 真机出现工具栏底部被键盘擦到时,把这个值调大即可。
  const KEYBOARD_LIFT_BUFFER = 20;
  const sheetLift = emojiOpen
    ? Math.max(lastKnownKeyboardHeight, EMOJI_PANEL_HEIGHT_DEFAULT)
    : keyboardHeight > 0
    ? keyboardHeight + KEYBOARD_LIFT_BUFFER
    : 0;

  const ordered = useMemo(() => {
    const roots = comments.filter((c) => !c.parentId).sort((a, b) => b.createdAt - a.createdAt);
    const repliesOf = (rootId: string) =>
      comments.filter((c) => c.parentId === rootId).sort((a, b) => a.createdAt - b.createdAt);
    const list: Comment[] = [];
    for (const r of roots) {
      list.push(r);
      list.push(...repliesOf(r.id));
    }
    return list;
  }, [comments]);

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    if (input.isFocused()) {
      input.blur();
      setTimeout(() => input.focus(), 50);
    } else {
      input.focus();
    }
  }, []);

  const scrollToComment = useCallback((commentId: string) => {
    const idx = ordered.findIndex((c) => c.id === commentId);
    if (idx < 0) return;
    setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.2,
      });
    }, 300);
  }, [ordered]);

  const requireLogin = (msg: string) => {
    showAuthRequired(msg, () => router.push('/auth/login'));
  };

  const handleReply = (comment: Comment) => {
    if (!user) {
      requireLogin('登录后即可回复评论,加入讨论 ✨');
      return;
    }
    const target = comment.parentId
      ? ordered.find((c) => c.id === comment.parentId) ?? comment
      : comment;
    setReplyTo(target);
    setEmojiOpen(false);
    focusInput();
    scrollToComment(target.id);
  };

  const handleInputFocusGate = () => {
    if (!user) {
      inputRef.current?.blur();
      requireLogin('登录后即可发表评论,和大家互动 💬');
    } else {
      if (emojiOpen) setEmojiOpen(false);
    }
  };

  const onSubmit = () => {
    const text = draft.trim();
    if (!text) return;
    if (!user) {
      requireLogin('登录后即可发表评论 💬');
      return;
    }
    addComment(videoId, text, replyTo?.id ?? null, { id: user.id, name: user.username });
    setDraft('');
    setReplyTo(null);
    setEmojiOpen(false);
    Keyboard.dismiss();
  };

  const toggleEmoji = () => {
    if (!user) {
      requireLogin('登录后即可使用表情 ✨');
      return;
    }
    if (emojiOpen) {
      setEmojiOpen(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      Keyboard.dismiss();
      // 等键盘动画完成再显示 emoji 面板,避免跳动
      setTimeout(() => setEmojiOpen(true), Platform.OS === 'ios' ? 250 : 100);
    }
  };

  const insertEmoji = (e: string) => setDraft((prev) => prev + e);
  const backspace = () => setDraft((prev) => {
    if (!prev) return '';
    const codePoints = Array.from(prev);
    codePoints.pop();
    return codePoints.join('');
  });

  const onLikeComment = (commentId: string) => {
    if (!user) {
      requireLogin('登录后即可点赞评论 ❤️');
      return;
    }
    toggleLike(videoId, commentId);
  };

  const canSend = draft.trim().length > 0;

  const renderItem = ({ item }: ListRenderItemInfo<Comment>) => (
    <CommentRow
      comment={item}
      onLike={() => onLikeComment(item.id)}
      onReply={() => handleReply(item)}
    />
  );

  const placeholder = !user
    ? '登录后即可参与评论…'
    : replyTo
    ? `回复 @${replyTo.authorName}…`
    : '有话要说,快来评论';

  // ===== 关键布局逻辑 =====
  //
  // 核心策略:键盘 / emoji 弹起时,**整个 Sheet 通过 backdrop paddingBottom 上移 sheetLift 像素**。
  // 这样 sheet 的底端始终贴在键盘 / emoji panel 的上沿,composer 自然不被遮。
  //
  // 优势:
  // 1. 不依赖 KeyboardAvoidingView(在 Modal 里不可靠)
  // 2. 不依赖键盘事件精度(Android 不同设备给的高度可能少 ~20px)
  // 3. sheet overflow:'hidden' 也不会再裁掉 composer

  // 评论列表底部留 composer 自身高度的空间(~180,包含 replyChip + input + toolbar)
  // 这样最后一条评论不会被 composer 遮
  const composerSelfHeight = replyTo ? 240 : 180;

  // emoji 面板高度,确保不超过 sheet 高度的一半
  const emojiPanelHeight = Math.min(
    Math.max(lastKnownKeyboardHeight, EMOJI_PANEL_HEIGHT_DEFAULT),
    SHEET_HEIGHT * 0.55,
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingBottom: sheetLift }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[styles.sheet, sheetStyle]}>
          {/* Header */}
          <GestureDetector gesture={pan}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>{ordered.length} 条评论</Text>
                <Pressable hitSlop={12} onPress={close}>
                  <X color={colors.textMuted} size={22} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>

          {/* 评论列表 — paddingBottom 留出 composer 高度避免遮挡 */}
          <FlatList
            ref={listRef}
            data={ordered}
            keyExtractor={(c) => c.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: composerSelfHeight + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.empty}>
                <MessageCircle color={colors.textDim} size={36} />
                <Text style={styles.emptyText}>抢沙发,留下第一条评论</Text>
              </View>
            }
            renderItem={renderItem}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
              }, 100);
            }}
          />

          {/* Composer:绝对定位在 sheet 底部(bottom=0)。
              键盘 / emoji 弹起时,整个 sheet 通过 backdrop paddingBottom 上移,
              composer 自动跟随,不会被任何东西遮。 */}
          <View
            style={[
              styles.composerWrap,
              {
                bottom: 0,
                paddingBottom: 8,
              },
            ]}
          >
            {replyTo && (
              <View style={styles.replyChip}>
                <CornerDownRight color={colors.accent} size={14} />
                <Text style={styles.replyChipText} numberOfLines={1}>
                  <Text style={styles.replyChipName}>回复 @{replyTo.authorName}: </Text>
                  {replyTo.text}
                </Text>
                <Pressable hitSlop={8} onPress={() => { setReplyTo(null); Keyboard.dismiss(); }}>
                  <X color={colors.textMuted} size={14} />
                </Pressable>
              </View>
            )}

            <View style={styles.inputBubble}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                onFocus={handleInputFocusGate}
                placeholder={placeholder}
                placeholderTextColor={colors.textDim}
                multiline
                maxLength={300}
                blurOnSubmit={false}
                editable={!!user}
              />
            </View>

            <View style={styles.toolbar}>
              <View style={styles.tools}>
                <ToolBtn icon={<Mic size={22} color={colors.textMuted} strokeWidth={1.6} />} />
                <ToolBtn icon={<ImageIcon size={22} color={colors.textMuted} strokeWidth={1.6} />} />
                <ToolBtn icon={<AtSign size={22} color={colors.textMuted} strokeWidth={1.6} />} />
                <ToolBtn
                  icon={<Smile size={22} color={emojiOpen ? colors.primary : colors.textMuted} strokeWidth={1.6} />}
                  onPress={toggleEmoji}
                />
                <ToolBtn icon={<Plus size={22} color={colors.textMuted} strokeWidth={1.6} />} />
              </View>
              <Pressable
                style={[styles.sendBtn, canSend && styles.sendBtnActive]}
                disabled={!canSend && !!user}
                onPress={onSubmit}
                hitSlop={6}
              >
                <Text style={[styles.sendText, canSend && styles.sendTextActive]}>发送</Text>
              </Pressable>
            </View>

            {/* 键盘/emoji 都没起时,给底部 safe area 留空间(home indicator) */}
            {sheetLift === 0 && <View style={{ height: insets.bottom }} />}
          </View>

        </Animated.View>

        {/* Emoji 面板:在 sheet 之外,绝对定位贴屏幕底部。
            sheet 通过 backdrop paddingBottom 上移 emojiPanelHeight,刚好让 sheet 底贴在 emoji panel 顶。
            这样 emoji panel 和键盘的位置是等价的 —— 都在屏幕最底,sheet 浮在它上面。 */}
        {emojiOpen && (
          <View
            style={[
              styles.emojiPanel,
              {
                height: emojiPanelHeight,
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <EmojiGrid onPick={insertEmoji} onBackspace={backspace} />
          </View>
        )}
      </View>
    </Modal>
  );
}

function ToolBtn({ icon, onPress }: { icon: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable hitSlop={4} onPress={onPress} style={styles.toolBtn}>
      {icon}
    </Pressable>
  );
}

function EmojiGrid({ onPick, onBackspace }: { onPick: (e: string) => void; onBackspace: () => void }) {
  const itemSize = (SCREEN_W - spacing.lg * 2) / EMOJI_COLUMNS;
  return (
    <View style={styles.emojiGridWrap}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.emojiGrid}
        keyboardShouldPersistTaps="always"
      >
        {EMOJIS.map((e) => (
          <Pressable
            key={e}
            onPress={() => onPick(e)}
            style={[styles.emojiItem, { width: itemSize, height: itemSize }]}
          >
            <Text style={styles.emojiText}>{e}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable style={styles.emojiBackspace} onPress={onBackspace} hitSlop={6}>
        <Delete color={colors.text} size={20} />
      </Pressable>
    </View>
  );
}

function CommentRow({ comment, onLike, onReply }: { comment: Comment; onLike: () => void; onReply: () => void }) {
  const isReply = !!comment.parentId;
  return (
    <View style={[styles.row, isReply && styles.rowReply]}>
      <View style={[styles.avatar, { backgroundColor: comment.authorAvatarColor }]}>
        <Text style={styles.avatarTxt}>{comment.authorName.slice(0, 1)}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.authorName}>{comment.authorName}</Text>
        <Text style={styles.body}>{comment.text}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaTime}>{timeAgo(comment.createdAt)}</Text>
          <Pressable hitSlop={8} onPress={onReply}>
            <Text style={styles.metaAction}>回复</Text>
          </Pressable>
          {!isReply && comment.replyCount > 0 && (
            <Text style={styles.metaTime}>{comment.replyCount} 条回复</Text>
          )}
        </View>
      </View>
      <Pressable style={styles.likeCol} hitSlop={8} onPress={onLike}>
        <Heart
          size={18}
          color={comment.liked ? colors.primary : colors.textMuted}
          fill={comment.liked ? colors.primary : 'transparent'}
        />
        <Text style={[styles.likeNum, comment.liked && { color: colors.primary }]}>
          {comment.likeCount > 0 ? comment.likeCount : ''}
        </Text>
      </Pressable>
    </View>
  );
}

function timeAgo(ts: number): string {
  const diff = new Date().valueOf() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}天前`;
  return `${Math.floor(d / 30)}个月前`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  handleWrap: { paddingTop: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { ...typography.h3, color: colors.text },

  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  empty: { alignItems: 'center', paddingVertical: 80, gap: spacing.sm },
  emptyText: { color: colors.textMuted, ...typography.body },

  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, alignItems: 'flex-start' },
  rowReply: { paddingLeft: spacing.xxl, paddingVertical: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rowMain: { flex: 1, gap: 2 },
  authorName: { ...typography.captionStrong, color: colors.textSecondary },
  body: { ...typography.body, color: colors.text, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: 4 },
  metaTime: { ...typography.tiny, color: colors.textDim },
  metaAction: { ...typography.tiny, color: colors.textMuted, fontWeight: '600' },
  likeCol: { alignItems: 'center', minWidth: 28, gap: 2, paddingTop: 4 },
  likeNum: { ...typography.tiny, color: colors.textMuted },

  // 关键:composer 绝对定位,bottom 由 state 控制
  composerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  replyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.sm,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  replyChipText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  replyChipName: { color: colors.text, fontWeight: '700' },

  inputBubble: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  input: {
    color: colors.text,
    ...typography.body,
    maxHeight: 110,
    minHeight: 28,
    padding: 0,
  },

  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md, // 额外 buffer 给发送按钮的圆弧底边留呼吸空间
  },
  tools: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  toolBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 64,
  },
  sendBtnActive: { backgroundColor: colors.primary },
  sendText: { ...typography.captionStrong, color: colors.textMuted, fontSize: 14 },
  sendTextActive: { color: '#fff' },

  // emoji 面板:绝对定位在 sheet 底部,替代键盘的位置
  emojiPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  emojiGridWrap: { flex: 1, position: 'relative' },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 56,
  },
  emojiItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 26 },
  emojiBackspace: {
    position: 'absolute',
    right: spacing.lg, bottom: spacing.sm,
    width: 44, height: 36, borderRadius: 8,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
});
