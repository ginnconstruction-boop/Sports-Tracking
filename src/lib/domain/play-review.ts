export type PlayReviewAnnotation = {
  playId: string;
  gameId: string;
  tags: string[];
  note?: string | null;
  filmUrl?: string | null;
  updatedAt: string;
};
