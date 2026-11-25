/** One day of a whole page (account) on one platform. A missing number is null: "unavailable", never 0. */
export interface PageRow {
  date: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  reach: number | null;
  views: number | null;
  profileViews: number | null;
  accountsEngaged: number | null;
}
