export interface PromptTemplate {
  id: string;
  name: string;
  template: string; // {{TEXT}} and optionally {{INSTRUCTION}} placeholders
  order: number;
}

export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: "rewrite-formal",
    name: 'Переписать (формально)',
    template: 'Перепиши следующий текст, заменив все обращения на "мы"/"наш" вместо "вы"/"ваш". Сохрани структуру и смысл. Верни только готовый текст без пояснений.\n\n{{TEXT}}',
    order: 0,
  },
  {
    id: "rewrite-friendly",
    name: "Сделать дружелюбнее",
    template: "Перепиши следующий текст в более дружелюбном и неформальном тоне. Сохрани всю информацию. Верни только готовый текст.\n\n{{TEXT}}",
    order: 1,
  },
  {
    id: "custom",
    name: "Свой промпт",
    template: "{{INSTRUCTION}}\n\n{{TEXT}}",
    order: 2,
  },
];

export function hasInstructionPlaceholder(template: string): boolean {
  return template.includes("{{INSTRUCTION}}");
}

export function assemblePrompt(
  template: string,
  text: string,
  instruction?: string,
): string {
  let result = template;
  result = result.replace(/\{\{TEXT\}\}/g, text);
  result = result.replace(/\{\{INSTRUCTION\}\}/g, instruction ?? "");
  return result.trim();
}
