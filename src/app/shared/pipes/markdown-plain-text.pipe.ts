import { Pipe, type PipeTransform } from '@angular/core';
import { lexer, type Token, type Tokens } from 'marked';

@Pipe({
  name: 'markdownPlainText',
  standalone: true,
  pure: true,
})
export class MarkdownPlainTextPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return markdownToPlainText(value);
  }
}

export function markdownToPlainText(value: string | null | undefined): string {
  if (!value) return '';

  const contentOnlyMarkdown = value.replace(
    /<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ' ',
  );
  return tokensToText(lexer(contentOnlyMarkdown)).replace(/\s+/g, ' ').trim();
}

function tokensToText(tokens: Token[]): string {
  return tokens.map(tokenToText).join('');
}

function tokenToText(token: Token): string {
  switch (token.type) {
    case 'space':
    case 'br':
    case 'hr':
      return '\n';
    case 'code':
      return `${token.text}\n`;
    case 'codespan':
    case 'escape':
      return token.text;
    case 'html':
      return htmlToText(token.text);
    case 'image':
      return token.text;
    case 'list': {
      const list = token as Tokens.List;
      return `${list.items.map((item: Tokens.ListItem) => tokenToText(item)).join('\n')}\n`;
    }
    case 'table':
      return tableToText(token as Tokens.Table);
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'list_item': {
      const container = token as Tokens.Paragraph | Tokens.Heading | Tokens.Blockquote | Tokens.ListItem;
      return `${tokensToText(container.tokens)}\n`;
    }
    default: {
      const nestedTokens = 'tokens' in token && Array.isArray(token.tokens)
        ? token.tokens as Token[]
        : null;
      if (nestedTokens) return tokensToText(nestedTokens);
      return 'text' in token && typeof token.text === 'string' ? token.text : '';
    }
  }
}

function tableToText(table: Tokens.Table): string {
  const rows = [table.header, ...table.rows];
  return `${rows.map(row => row.map(cell => tokensToText(cell.tokens)).join(' ')).join('\n')}\n`;
}

function htmlToText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, style, template').forEach(element => element.remove());
  return parsed.body.textContent ?? '';
}
