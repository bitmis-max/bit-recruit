export type QuestionType =
  | "text"
  | "long_text"
  | "single_choice"
  | "multi_choice"
  | "number"
  | "date";

export type FormQuestion = {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[] | null;
  is_required: boolean;
  order_index: number;
};

export type RecruitmentPosition = {
  id: string;
  name: string;
  description: string | null;
  campaign_id: string;
};

export type ApplicationForm = {
  id: string;
  name: string;
  description: string | null;
};
