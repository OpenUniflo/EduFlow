import { createContext, useContext, type ReactNode } from "react";
import type { MockTask } from "../app/model";

type TaskContextValue = {
  tasks: MockTask[];
  activeTask: MockTask;
  openTask: (taskId: string) => void;
  toggleTaskChecklist: (taskId: string, checklistId: string) => void;
  runTaskChecks: (taskId: string) => void;
  submitTask: (taskId: string) => void;
};

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ value, children }: { value: TaskContextValue; children: ReactNode }) {
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const value = useContext(TaskContext);
  if (!value) {
    throw new Error("useTasks must be used within TaskProvider");
  }
  return value;
}
