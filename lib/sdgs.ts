export interface Sdg {
  id: number;
  title: string;
  color: string;
}

/** Only the goals actually mapped to experiments. We do not claim all 17. */
export const SDGS: Record<number, Sdg> = {
  1: { id: 1, title: "No Poverty", color: "#E5243B" },
  2: { id: 2, title: "Zero Hunger", color: "#DDA63A" },
  3: { id: 3, title: "Good Health and Well-being", color: "#4C9F38" },
  4: { id: 4, title: "Quality Education", color: "#C5192D" },
  8: { id: 8, title: "Decent Work and Economic Growth", color: "#A21942" },
  9: { id: 9, title: "Industry, Innovation and Infrastructure", color: "#FD6925" },
  10: { id: 10, title: "Reduced Inequalities", color: "#DD1367" },
  11: { id: 11, title: "Sustainable Cities and Communities", color: "#FD9D24" },
  12: { id: 12, title: "Responsible Consumption and Production", color: "#BF8B2E" },
  13: { id: 13, title: "Climate Action", color: "#3F7E44" },
  16: { id: 16, title: "Peace, Justice and Strong Institutions", color: "#00689D" },
  17: { id: 17, title: "Partnerships for the Goals", color: "#19486A" },
};
