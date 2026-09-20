/**
 * WegUp AI Mock Interviewer Module
 * Simulates realistic technical & behavioral interviews with turn-by-turn feedback and comprehensive scorecards.
 */

import { generateGeminiJSON, generateGeminiText, isLiveAIMode } from "./api.js?v=3.5.0";
import { uid, getState, saveState, logActivity } from "./state.js?v=3.5.0";

export const INTERVIEW_TYPES = [
  { id: "technical", name: "Technical / Core CS", desc: "Role-specific architecture, algorithms, coding logic, and debugging." },
  { id: "behavioral", name: "Behavioral & HR (STAR)", desc: "Conflict resolution, teamwork, college projects, and situational judgment." },
  { id: "system_design", name: "System Design & Architecture", desc: "Scalability, APIs, caching, databases, and microservices for freshers." },
  { id: "cs_fundamentals", name: "DBMS, OS & Computer Networks", desc: "Core placement viva questions (Normalization, Threads, TCP/IP, Indexes)." }
];

const LOCAL_INTERVIEWS = {
  technical: [
    {
      q: "Can you explain the difference between synchronous and asynchronous execution, and how the JavaScript event loop or OS thread pool handles them?",
      keywords: ["event loop", "call stack", "callback queue", "non-blocking", "thread", "promise"],
      ideal: "Synchronous code blocks execution until finished, whereas asynchronous operations offload work (e.g. I/O) and handle results via callbacks/promises once the call stack is empty."
    },
    {
      q: "When would you choose a NoSQL database (like MongoDB) over a Relational database (like PostgreSQL), and vice versa?",
      keywords: ["acid", "schema", "relational", "unstructured", "join", "horizontal scale"],
      ideal: "RDBMS is ideal when data has structured relationships and requires ACID transactions. NoSQL shines for rapidly evolving schemas, horizontal scaling, or document-oriented data."
    },
    {
      q: "Walk me through how you would optimize a web application or API that is experiencing slow response times.",
      keywords: ["database indexing", "caching", "redis", "profiling", "network latency", "cdn", "payload"],
      ideal: "Start with profiling/APM tools to identify bottlenecks. Check DB queries for missing indexes, implement caching (Redis/browser), reduce payload size, and use pagination."
    }
  ],
  behavioral: [
    {
      q: "Tell me about a challenging engineering or academic project you worked on. What obstacles did you encounter, and how did you resolve them?",
      keywords: ["situation", "task", "action", "result", "debugged", "collaborated"],
      ideal: "Use the STAR method: explain the context, your specific responsibility, the concrete engineering actions you took, and the measurable outcome."
    },
    {
      q: "Describe a time when you had a disagreement with a project teammate or peer regarding a technical design choice. How did you handle it?",
      keywords: ["listened", "trade-offs", "objective", "consensus", "data-driven", "respectful"],
      ideal: "Focus on listening objectively, evaluating technical trade-offs with data/benchmarks rather than ego, and reaching a team-first consensus."
    },
    {
      q: "How do you stay updated with emerging technologies and tools, and how have you applied self-learning in your college journey?",
      keywords: ["documentation", "github", "hands-on", "open source", "built projects"],
      ideal: "Show genuine passion by mentioning technical blogs, reading official docs, building personal proof-of-concepts, and contributing to open-source or campus projects."
    }
  ]
};

export class InterviewSession {
  constructor(type = "technical", role = "Full Stack Engineer", difficulty = "Intermediate") {
    this.id = uid();
    this.type = type;
    this.role = role;
    this.difficulty = difficulty;
    this.currentStep = 0;
    this.totalSteps = 3;
    this.messages = [];
    this.completed = false;
    this.scorecard = null;
  }

  async start() {
    this.messages = [];
    if (isLiveAIMode()) {
      try {
        const prompt = `
You are an expert, supportive yet rigorous Senior Technical Interviewer conducting a mock placement interview for a 3rd-year engineering student.
Target Role: ${this.role}
Interview Focus: ${this.type}
Candidate Level: ${this.difficulty}

Give a warm, professional 1-sentence greeting, state the interview focus, and ask Question 1 (out of 3).
Be realistic and concise.
`;
        const initialQ = await generateGeminiText(prompt, "You are a tech interviewer.");
        if (initialQ) {
          this.messages.push({ role: "interviewer", text: initialQ });
          return this.messages;
        }
      } catch (err) {
        console.warn("AI interview init error, falling back to local questions:", err);
      }
    }

    // Local scripted fallback
    const bank = LOCAL_INTERVIEWS[this.type] || LOCAL_INTERVIEWS.technical;
    const firstQ = bank[0].q;
    this.messages.push({
      role: "interviewer",
      text: `Hello! Welcome to your ${this.role} (${this.type}) mock interview session. Let's start with Question 1 of 3:\n\n${firstQ}`
    });
    return this.messages;
  }

  async submitAnswer(answerText) {
    if (this.completed) return { completed: true, scorecard: this.scorecard };

    this.messages.push({ role: "candidate", text: answerText });
    this.currentStep += 1;

    if (this.currentStep >= this.totalSteps) {
      // Finalize and generate scorecard
      this.completed = true;
      this.scorecard = await this.evaluateSession();
      this.saveToHistory();
      return { completed: true, scorecard: this.scorecard, messages: this.messages };
    }

    // Next question & feedback
    if (isLiveAIMode()) {
      try {
        const prompt = `
Candidate answered Question ${this.currentStep} of ${this.totalSteps}.
Conversation history:
${this.messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join("\n\n")}

Task:
1. Provide a 1-2 sentence constructive critique of the candidate's latest response (highlighting what was good and any technical gaps).
2. Transition smoothly and ask Question ${this.currentStep + 1} of ${this.totalSteps} (appropriate for a ${this.role} student).
Keep the whole response under 100 words.
`;
        const reply = await generateGeminiText(prompt);
        if (reply) {
          this.messages.push({ role: "interviewer", text: reply });
          return { completed: false, messages: this.messages };
        }
      } catch (err) {
        console.warn("Error in live AI answer evaluation:", err);
      }
    }

    // Local evaluation & next question
    const bank = LOCAL_INTERVIEWS[this.type] || LOCAL_INTERVIEWS.technical;
    const nextQObj = bank[this.currentStep % bank.length];
    const prevQObj = bank[(this.currentStep - 1) % bank.length];

    // Simple keyword heuristic
    const matchedCount = (prevQObj.keywords || []).filter((kw) => answerText.toLowerCase().includes(kw)).length;
    const feedback = matchedCount >= 2
      ? "Strong response! You highlighted key concepts clearly."
      : "Good attempt. For higher interview impact, try including more concrete technical keywords and architectural trade-offs.";

    this.messages.push({
      role: "interviewer",
      text: `${feedback}\n\nLet's move to Question ${this.currentStep + 1} of ${this.totalSteps}:\n\n${nextQObj.q}`
    });

    return { completed: false, messages: this.messages };
  }

  async evaluateSession() {
    if (isLiveAIMode()) {
      try {
        const prompt = `
Analyze the candidate's complete mock interview performance:
Role: ${this.role}
Focus: ${this.type}
Transcript:
${this.messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join("\n\n")}

Return JSON with this exact schema:
{
  "overallScore": 84, // integer 0-100
  "technicalRating": 4, // 1 to 5
  "communicationRating": 4, // 1 to 5
  "summary": "2 sentences summarizing candidate readiness and delivery style",
  "strengths": ["Strength point 1", "Strength point 2", "Strength point 3"],
  "improvements": ["Improvement tip 1", "Improvement tip 2"],
  "proTip": "One golden tip to crack placement interviews for this role"
}
`;
        const result = await generateGeminiJSON(prompt);
        if (result && result.overallScore) {
          return result;
        }
      } catch (err) {
        console.warn("Live AI scorecard generation failed:", err);
      }
    }

    // Local Heuristic Scorecard
    const candidateAnswers = this.messages.filter((m) => m.role === "candidate");
    const totalWords = candidateAnswers.reduce((sum, m) => sum + m.text.split(/\s+/).length, 0);
    const avgLength = totalWords / Math.max(1, candidateAnswers.length);
    const baseScore = Math.min(94, Math.max(65, Math.round(60 + avgLength * 0.4)));

    return {
      overallScore: baseScore,
      technicalRating: baseScore >= 85 ? 5 : baseScore >= 75 ? 4 : 3,
      communicationRating: avgLength >= 30 ? 4 : 3,
      summary: `You demonstrated solid foundational concepts for a ${this.role} fresher. Continued practice on articulating system trade-offs will boost your interview conversion rate.`,
      strengths: [
        "Direct approach to problem statements without hesitation",
        "Clear understanding of foundational principles",
        "Receptive to situational and scenario prompts"
      ],
      improvements: [
        "Structure behavioral answers strictly around STAR (Situation, Task, Action, Result)",
        "Quantify project achievements with metrics (e.g., 'reduced load time by 30%')"
      ],
      proTip: "Before diving into complex explanations, summarize your high-level thesis in one clear sentence, then elaborate."
    };
  }

  saveToHistory() {
    const state = getState();
    if (!state.interviews) state.interviews = [];
    state.interviews.unshift({
      id: this.id,
      date: new Date().toISOString(),
      type: this.type,
      role: this.role,
      difficulty: this.difficulty,
      scorecard: this.scorecard,
      transcript: this.messages
    });
    logActivity(`Completed ${this.type} mock interview (Score: ${this.scorecard.overallScore}/100)`, "interview");
    saveState();
  }
}
