export function inspectWork(html) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  const chatTags = (html.match(/<(?:user-query|model-response|chat-window|message-content)\b/gi) || []).length;
  const geminiURLs = (html.match(/(?:gemini|bard)\.google\.com/gi) || []).length;
  const chatClasses = (html.match(/conversation-container|query-content|response-container|chat-history/gi) || []).length;
  const isConversation = (chatTags >= 2 && geminiURLs > 0) || (/^(?:Google\s+)?Gemini$/i.test(title) && (geminiURLs > 0 || chatClasses > 0));
  const requiresViewportHeight = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].some(style =>
    [...style[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(rule =>
      /(^|,)\s*(?:body|html)\s*(?:,|$)/i.test(rule[1].trim()) && /(?:^|;)\s*height\s*:\s*(?:100%|100d?vh)\s*(?:!important\s*)?(?:;|$)/i.test(rule[2])));
  return { isConversation, title, chatTags, geminiURLs, chatClasses, requiresViewportHeight };
}
