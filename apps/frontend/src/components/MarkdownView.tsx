import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownView({ markdown }: { markdown: string }): JSX.Element {
  return (
    <Box
      sx={{
        '& h1, & h2, & h3': { mt: 2, mb: 1 },
        '& p': { my: 1, lineHeight: 1.6 },
        '& ul, & ol': { my: 1, pl: 3 },
        '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
        '& a': { color: 'primary.main' },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown || '_(empty)_'}</ReactMarkdown>
    </Box>
  );
}
