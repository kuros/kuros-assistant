import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link as RouterLink } from 'react-router-dom';

export const wikiHref = (path: string): string => `/knowledge/wiki/${path}`;

/** Converts Obsidian-style [[path|Label]] links into markdown links into the wiki browser. */
export function wikiLinksToMarkdown(md: string): string {
  return md.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, rawPath: string, label?: string) => {
    const path = rawPath.trim().replace(/\.md$/i, '').replace(/^\/+/, '');
    const text = (label ?? path.split('/').pop() ?? path).replace(/[[\]]/g, '');
    return `[${text}](${wikiHref(path)})`;
  });
}

export function WikiMarkdown({ markdown, dense = false }: { markdown: string; dense?: boolean }): JSX.Element {
  return (
    <Box
      sx={{
        '& h1': { fontSize: dense ? '1.1rem' : '1.5rem', mt: dense ? 1 : 0, mb: 1.5, fontWeight: 600 },
        '& h2': { fontSize: dense ? '1rem' : '1.15rem', mt: 2.5, mb: 1, fontWeight: 600 },
        '& h3': { fontSize: '1rem', mt: 2, mb: 1, fontWeight: 600 },
        '& p': { my: 1, lineHeight: 1.65 },
        '& ul, & ol': { my: 1, pl: 3 },
        '& li': { my: 0.25, lineHeight: 1.6 },
        '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: '0.85em' },
        '& pre': { bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflowX: 'auto' },
        '& blockquote': { borderLeft: 3, borderColor: 'primary.main', pl: 2, ml: 0, color: 'text.secondary' },
        '& table': { borderCollapse: 'collapse', my: 1.5, display: 'block', overflowX: 'auto' },
        '& th, & td': { border: 1, borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
        '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith('/') ? (
              <RouterLink to={href}>{children}</RouterLink>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {wikiLinksToMarkdown(markdown) || '_(empty)_'}
      </ReactMarkdown>
    </Box>
  );
}
