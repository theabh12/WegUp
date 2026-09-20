/**
 * WegUp AI Career Coach Module
 * Personalized, context-aware engineering mentor grounded in student goals and progress.
 */

import { generateGeminiText, isLiveAIMode } from "./api.js";
import { getActiveGoal, getState } from "./state.js";

export async function askCareerCoach(userMessage, conversationHistory = []) {
  const goal = getActiveGoal();
  const state = getState();
  const studentName = state.profile?.name || "Student";
  const roleName = goal ? goal.name : "Software Engineer";
  const pendingTasks = goal ? goal.tasks.filter((t) => !t.done) : [];
  const completedTasks = goal ? goal.tasks.filter((t) => t.done) : [];

  if (isLiveAIMode()) {
    try {
      const systemInstruction = `
You are WegUp AI Coach, an empathetic, highly knowledgeable senior engineering career mentor helping a 3rd-year college student named ${studentName}.
STUDENT CONTEXT:
- Target Role: ${roleName}
- Target Deadline: ${goal?.deadline || "Upcoming placement season"}
- Completed Tasks: ${completedTasks.length} / ${goal?.tasks?.length || 0}
- Next Pending Topic: ${pendingTasks[0]?.title || "General practice"}

GUIDELINES:
1. Provide actionable, concise, and structured advice (bullet points, clear steps).
2. Avoid generic platitudes; focus on concrete engineering actions, portfolio proofs, and interview preparation.
3. Keep answers under 180 words unless the user specifically requests an in-depth guide.
`;

      const formattedHistory = conversationHistory
        .slice(-6)
        .map((m) => `${m.role === "user" ? studentName : "Coach"}: ${m.text}`)
        .join("\n\n");

      const prompt = `${formattedHistory}\n\n${studentName}: ${userMessage}\nCoach:`;
      const reply = await generateGeminiText(prompt, systemInstruction);
      if (reply) return reply;
    } catch (err) {
      console.warn("Live Gemini coach chat failed, falling back to local heuristic coach:", err);
    }
  }

  // Local Heuristic Career Coach
  return getLocalCoachResponse(userMessage, studentName, roleName, pendingTasks);
}

function getLocalCoachResponse(input, studentName, roleName, pendingTasks) {
  const q = input.toLowerCase();

  if (q.includes("today") || q.includes("focus") || q.includes("start") || q.includes("next")) {
    if (pendingTasks.length > 0) {
      return `Hey ${studentName}, here is your high-priority action item for today:\n\n• **${pendingTasks[0].title}** (${pendingTasks[0].minutes} mins)\n\nTip: Dedicate one uninterrupted 30-minute block. Build a small working example before reading more theory.`;
    }
    return `Great momentum, ${studentName}! You've finished your current roadmap queue. Head over to the **Mock Interview** tab to test your vocal delivery, or generate an **Adaptive Quiz** in Practice.`;
  }

  if (q.includes("resume") || q.includes("cv") || q.includes("ats")) {
    return `To make your ${roleName} resume stand out to recruiters:\n\n1. **Use the Google XYZ Formula**: "Accomplished [X] as measured by [Y], by doing [Z]".\n2. **Include Links**: Every project must have a live demo or GitHub repository link.\n3. **Tech Stack Subheads**: Under each project, explicitly list the technologies used (e.g. *Tech: React, Node.js, PostgreSQL*).\n4. Test your draft in our **Resume ATS Scanner** tab for instant scoring!`;
  }

  if (q.includes("interview") || q.includes("crack") || q.includes("hr")) {
    return `For technical and HR interviews, practice the **STAR Framework**:\n\n• **S (Situation)**: Set the context (college project, hackathon, bug in production).\n• **T (Task)**: What challenge needed solving?\n• **A (Action)**: Specifically what technical decisions did *you* make?\n• **R (Result)**: What was the outcome, quantified if possible?\n\nTip: Jump into the **AI Mock Interview** tab to practice out loud right now!`;
  }

  if (q.includes("linkedin") || q.includes("outreach") || q.includes("email") || q.includes("referral")) {
    return `Here is a high-converting cold outreach template for engineering recruiters:\n\n"Hi [Name], I noticed you lead engineering hiring at [Company]. I'm a 3rd-year CS student who recently built [Project Name] solving [Specific Problem] using [Tech Stack]. I've followed [Company]'s work on [Recent Feature/Product] and would love to be considered for intern/SDE-1 roles. Here is my project repo: [GitHub URL]. Best, ${studentName}"`;
  }

  if (q.includes("overwhelm") || q.includes("stress") || q.includes("behind") || q.includes("anxious")) {
    return `Take a deep breath, ${studentName}. Placement preparation is an endurance run, not an overnight sprint.\n\nYou do NOT need to learn 20 frameworks at once. Pick just ONE foundational skill today, spend 25 focused minutes on it, and log the win. Small daily consistency beats weekend cramming every single time.`;
  }

  return `I'm here to help you get placement-ready for **${roleName}**!\n\nHere are some questions you can ask me:\n• *"What should I study today?"*\n• *"How do I explain my project to an interviewer?"*\n• *"Give me a cold outreach template for LinkedIn"*\n• *"How can I improve my ATS resume score?"*`;
}
