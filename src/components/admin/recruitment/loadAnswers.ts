import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase hosted trả tối đa 1000 dòng mỗi truy vấn, và `.in()` nhiều id làm URL quá dài.
// Nên: chia id thành lô nhỏ, mỗi lô phân trang `.range()` tới khi hết.
export const ANSWER_BATCH_SIZE = 50;
export const PAGE_SIZE = 1000;

export type RawAnswer = { application_id: string; question_id: string; answer_text: string | null; answer_json: unknown };
export type AnswerWithQuestion = RawAnswer & { question_text: string };

export function chunk<T>(items: T[], size = ANSWER_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Page<T> = { data: T[] | null; error: unknown };

/** Gọi `fetchPage(from, to)` lần lượt tới khi hết dữ liệu. Lỗi thì dừng và trả lỗi. */
export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<Page<T>>, pageSize = PAGE_SIZE): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return { data: all, error: null };
  }
}

/** Tải câu trả lời (kèm nội dung câu hỏi) của các đơn, theo lô ≤ 50 đơn. */
export async function loadApplicationAnswers(supabase: SupabaseClient, applicationIds: string[]): Promise<{ answers: AnswerWithQuestion[]; error: unknown }> {
  const raw: RawAnswer[] = [];
  for (const ids of chunk([...new Set(applicationIds)])) {
    // application_id + question_id là khóa duy nhất nên thứ tự ổn định giữa các trang.
    const { data, error } = await fetchAllPages<RawAnswer>((from, to) => supabase.from("application_answers")
      .select("application_id,question_id,answer_text,answer_json")
      .in("application_id", ids)
      .order("application_id").order("question_id")
      .range(from, to));
    if (error) return { answers: [], error };
    raw.push(...data);
  }

  const questionText = new Map<string, string>();
  for (const ids of chunk([...new Set(raw.map((answer) => answer.question_id))])) {
    const { data, error } = await supabase.from("form_questions").select("id,question_text").in("id", ids);
    if (error) return { answers: [], error };
    for (const question of data ?? []) questionText.set(question.id as string, question.question_text as string);
  }
  return { answers: raw.map((answer) => ({ ...answer, question_text: questionText.get(answer.question_id) ?? "Câu hỏi" })), error: null };
}
