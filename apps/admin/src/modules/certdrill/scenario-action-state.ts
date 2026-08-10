export type ScenarioActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialScenarioActionState: ScenarioActionState = { status: "idle" };
