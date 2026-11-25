import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import { format } from 'date-fns';
import type { ChatMessageDto } from '@kuros/shared';
import {
  useConversation,
  useConversations,
  useDeleteConversation,
  useFileAnswer,
  useSendChat,
  useWikiStatus,
} from '../api/hooks/knowledge';
import { WikiMarkdown, wikiHref } from '../components/WikiMarkdown';

const SUGGESTIONS = [
  'What happened yesterday that I should know about?',
  'What are the open risks across my teams right now?',
  'Summarise everything about the projects I am involved in this week.',
  'Who has been blocked on something recently, and by what?',
];

function pageLabel(path: string): string {
  return (path.split('/').pop() ?? path).replace(/-[0-9a-f]{6}$/, '').replace(/-/g, ' ');
}

function MessageBubble({
  m,
  onFile,
  filing,
}: {
  m: ChatMessageDto;
  onFile?: () => void;
  filing?: boolean;
}): JSX.Element {
  const isUser = m.role === 'user';
  return (
    <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <Paper
        variant="outlined"
        sx={{
          px: 2,
          py: isUser ? 1 : 1.5,
          maxWidth: isUser ? '75%' : '100%',
          width: isUser ? 'auto' : '100%',
          bgcolor: isUser ? 'action.selected' : 'background.paper',
        }}
      >
        {isUser ? (
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{m.content}</Typography>
        ) : (
          <>
            <WikiMarkdown markdown={m.content} />
            <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {m.citations.map((c) => (
                <Chip key={c} size="small" variant="outlined" component={Link} to={wikiHref(c)} clickable label={pageLabel(c)} />
              ))}
              <Box sx={{ flexGrow: 1 }} />
              {m.filedTo ? (
                <Button size="small" startIcon={<BookmarkAddedIcon />} component={Link} to={wikiHref(m.filedTo)}>
                  Saved to wiki
                </Button>
              ) : (
                <Tooltip title="File this answer into the wiki (answers/) so future questions can build on it">
                  <span>
                    <Button size="small" startIcon={<BookmarkAddOutlinedIcon />} onClick={onFile} disabled={filing}>
                      Save to wiki
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Stack>
          </>
        )}
      </Paper>
    </Box>
  );
}

export function KnowledgeChatPage(): JSX.Element {
  const { conversationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const conversations = useConversations();
  const conversation = useConversation(conversationId);
  const status = useWikiStatus();
  const send = useSendChat();
  const del = useDeleteConversation();
  const fileAnswer = useFileAnswer(conversationId);
  const [draft, setDraft] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Prefill from ?q= (e.g. "Ask about this day" on the dashboard).
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setDraft(q);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const messages = conversationId ? conversation.data?.messages ?? [] : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pendingQuestion]);

  const submit = (text: string) => {
    const message = text.trim();
    if (!message || send.isPending) return;
    setPendingQuestion(message);
    setDraft('');
    send.mutate(
      { conversationId, message },
      {
        onSuccess: (res) => {
          if (res.conversation.id !== conversationId) navigate(`/knowledge/ask/${res.conversation.id}`);
        },
        onError: () => setDraft(message),
        onSettled: () => setPendingQuestion(null),
      },
    );
  };

  const emptyWiki = status.data && status.data.pageCount === 0;

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 112px)' }}>
      <Paper variant="outlined" sx={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1.5 }}>
          <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/knowledge/ask')}>
            New chat
          </Button>
        </Box>
        <List dense sx={{ overflow: 'auto', flexGrow: 1 }}>
          {(conversations.data ?? []).map((c) => (
            <ListItemButton
              key={c.id}
              selected={c.id === conversationId}
              component={Link}
              to={`/knowledge/ask/${c.id}`}
              sx={{ pr: 5, position: 'relative' }}
            >
              <ListItemText
                primary={c.title}
                secondary={format(new Date(c.updatedAt), 'MMM d, HH:mm')}
                primaryTypographyProps={{ noWrap: true }}
              />
              <IconButton
                size="small"
                aria-label="Delete conversation"
                sx={{ position: 'absolute', right: 4 }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  del.mutate(c.id, { onSuccess: () => c.id === conversationId && navigate('/knowledge/ask') });
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </ListItemButton>
          ))}
          {conversations.data?.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
              No conversations yet.
            </Typography>
          )}
        </List>
      </Paper>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ flexGrow: 1, overflow: 'auto', pr: 1 }}>
          {emptyWiki && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Your knowledge base is empty. Answers come from the wiki compiled from your summaries — ingest them from
              the <Link to="/knowledge/wiki">Wiki</Link> page first.
            </Alert>
          )}
          {messages.length === 0 && !pendingQuestion && (
            <Box sx={{ maxWidth: 640, mx: 'auto', mt: 6, textAlign: 'center' }}>
              <Typography variant="h5" sx={{ mb: 1 }}>
                Ask your knowledge base
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                Answers are grounded in your wiki of people, teams, projects and daily sources, with links to the pages
                they came from. Uses the AI provider configured in Settings → AI.
              </Typography>
              <Stack spacing={1}>
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outlined" sx={{ textTransform: 'none', justifyContent: 'flex-start' }} onClick={() => submit(s)}>
                    {s}
                  </Button>
                ))}
              </Stack>
            </Box>
          )}
          <Stack spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                filing={fileAnswer.isPending && fileAnswer.variables === m.id}
                onFile={() => fileAnswer.mutate(m.id)}
              />
            ))}
            {pendingQuestion && (
              <>
                <MessageBubble
                  m={{ id: 'pending', role: 'user', content: pendingQuestion, citations: [], filedTo: null, createdAt: '' }}
                />
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'text.secondary', pl: 1 }}>
                  <CircularProgress size={18} />
                  <Typography variant="body2">Reading the wiki and composing an answer…</Typography>
                </Stack>
              </>
            )}
            {send.isError && <Alert severity="error">{(send.error as Error).message}</Alert>}
            <div ref={bottomRef} />
          </Stack>
        </Box>

        <Paper variant="outlined" sx={{ mt: 2, p: 1, display: 'flex', alignItems: 'flex-end', gap: 1, maxWidth: 900, width: '100%', mx: 'auto' }}>
          <TextField
            fullWidth
            multiline
            maxRows={8}
            placeholder="Ask about your work: people, projects, what happened, what's at risk…"
            variant="standard"
            InputProps={{ disableUnderline: true, sx: { px: 1, py: 0.5 } }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            disabled={send.isPending}
          />
          <IconButton color="primary" aria-label="Send" onClick={() => submit(draft)} disabled={!draft.trim() || send.isPending}>
            <SendIcon />
          </IconButton>
        </Paper>
      </Box>
    </Box>
  );
}
