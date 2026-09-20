/**
 * WegUp Dynamic AI Roadmap & Study Planner
 * Generates tailored syllabi using Gemini AI or structured intelligent fallback.
 */

import { generateGeminiJSON, isLiveAIMode } from "./api.js";
import { uid, dateKey, addDays, getActiveGoal, saveState, logActivity } from "./state.js";

export const PRESET_ROLES = {
  fullstack: {
    name: "Full Stack Engineer (MERN / Next.js)",
    skills: ["HTML5", "CSS3", "JavaScript", "TypeScript", "React", "Node.js", "Express", "MongoDB", "SQL", "Git", "REST APIs"],
    companies: "Product Startups & Tech MNCs",
    capstone: "Full-Stack Job Board & Application Tracker with Auth & Resume Parsing"
  },
  frontend: {
    name: "Frontend Specialist (React / Vue)",
    skills: ["JavaScript (ES6+)", "TypeScript", "React", "State Management", "Tailwind CSS", "Accessibility (a11y)", "Web Vitals", "API Integration"],
    companies: "High-growth Startups & Tech Giants",
    capstone: "Interactive Collaborative Kanban Board with Real-time WebSockets & A11y"
  },
  backend: {
    name: "Backend Engineer (Node.js / Java / Go / Python)",
    skills: ["RESTful APIs", "SQL & Database Design", "PostgreSQL", "Redis Caching", "Docker", "Authentication (JWT/OAuth)", "System Design Basics"],
    companies: "Fintech, E-commerce & Cloud Services",
    capstone: "High-throughput Scalable Payment & Transaction API with Rate Limiting & Redis"
  },
  ai_ml: {
    name: "AI & Machine Learning Engineer",
    skills: ["Python", "NumPy & Pandas", "Scikit-Learn", "PyTorch / TensorFlow", "LLMs & Prompt Engineering", "Vector DBs", "Model Deployment (FastAPI)"],
    companies: "AI Labs, Data-driven Enterprises & Research",
    capstone: "RAG-Powered Technical Q&A Assistant using Embeddings & Vector Search"
  },
  data_analyst: {
    name: "Data Analyst / Business Intelligence",
    skills: ["SQL (Advanced Queries & Joins)", "Excel / Google Sheets", "Python (Pandas, Seaborn)", "PowerBI / Tableau", "Statistical Analysis", "Business Metrics"],
    companies: "Consulting Firms, Analytics Startups & Retail Tech",
    capstone: "End-to-End E-Commerce Sales & Cohort Retention Analytics Dashboard"
  },
  devops: {
    name: "DevOps & Cloud Engineer (AWS / Docker)",
    skills: ["Linux Fundamentals", "Docker Containers", "Kubernetes Basics", "CI/CD Pipelines (GitHub Actions)", "AWS / GCP Core", "Terraform (IaC)", "Monitoring"],
    companies: "Cloud Infrastructure, SaaS Providers & Modern Tech",
    capstone: "Automated GitOps CI/CD Pipeline Deploying Containerized Microservices to Cloud"
  },
  cybersecurity: {
    name: "Cybersecurity Analyst",
    skills: ["Network Protocols (TCP/IP, DNS)", "Linux Administration", "OWASP Top 10", "Vulnerability Scanning", "Threat Modeling", "Basic Cryptography"],
    companies: "Cybersecurity Consulting, Banking & IT Security",
    capstone: "Security Audit & Automated Vulnerability Scanner for Web APIs with OWASP Reports"
  },
  mobile: {
    name: "Mobile App Developer (Flutter / React Native)",
    skills: ["Dart / Flutter", "State Management (Bloc / Riverpod)", "REST APIs", "Local SQLite Storage", "Push Notifications", "App Store Guidelines"],
    companies: "Consumer Tech, Fintech & Mobile-First Startups",
    capstone: "Offline-first Habit Tracker Mobile App with Cloud Sync & Interactive Charts"
  }
};

/**
 * Generate a complete, dynamic roadmap
 */
export async function generateRoadmap({ roleKey, customRoleName, level, knownSkills, dailyMinutes, targetDate, companyType }) {
  const roleName = roleKey === "custom" ? (customRoleName || "Custom Specialist") : (PRESET_ROLES[roleKey]?.name || "Software Engineer");
  
  if (isLiveAIMode()) {
    try {
      const prompt = `
You are a senior engineering mentor designing a personalized, high-yield job preparation roadmap for a 3rd-year engineering student.

STUDENT PROFILE:
- Target Role: ${roleName}
- Current Level: ${level} (beginner, intermediate, or advanced)
- Existing Known Skills: ${knownSkills || "None specified"}
- Daily Study Budget: ${dailyMinutes} minutes/day
- Target Completion Date: ${targetDate}
- Target Company Type: ${companyType || "Mix of Tech MNCs and Startups"}

REQUIREMENTS:
Generate a structured learning path with 4 sequential phases:
1. Phase 1: Core Fundamentals & Prerequisite Bridging
2. Phase 2: High-Impact Specialization & Framework Mastery
3. Phase 3: Portfolio Capstone Project & Real-World Building
4. Phase 4: Placement Preparation (DSA/Interview Questions, Resume & Mock Drills)

Return JSON in this EXACT structure:
{
  "summary": "2-sentence encouraging summary of the tailored strategy",
  "phases": [
    {
      "phaseName": "Name of Phase",
      "tasks": [
        {
          "title": "Clear actionable task title (e.g., 'Master SQL Window Functions & Aggregations')",
          "minutes": 30,
          "type": "concept" | "exercise" | "project" | "interview",
          "learningOutcome": "One brief sentence on what the student will achieve"
        }
      ]
    }
  ]
}
Include between 12 to 18 total concrete tasks across the 4 phases.
`;
      const aiResponse = await generateGeminiJSON(prompt, "You are an expert technical career architect for college engineering students.");
      if (aiResponse && aiResponse.phases && Array.isArray(aiResponse.phases)) {
        return transformAIPlanToTasks(aiResponse, dailyMinutes);
      }
    } catch (err) {
      console.warn("Live Gemini roadmap generation failed, falling back to smart local template:", err);
    }
  }

  // Smart Offline Fallback Generator
  return generateLocalRoadmap(roleKey, roleName, level, knownSkills, dailyMinutes);
}

function transformAIPlanToTasks(aiResponse, dailyMinutes) {
  const sessionMinutes = Math.min(45, dailyMinutes);
  const tasks = [];
  let dayOffset = 0;

  for (const phase of aiResponse.phases) {
    for (const t of phase.tasks) {
      tasks.push({
        id: uid(),
        phase: phase.phaseName,
        title: t.title,
        minutes: t.minutes || sessionMinutes,
        type: t.type || "concept",
        learningOutcome: t.learningOutcome || "",
        scheduled: addDays(dateKey(), dayOffset),
        done: false,
        completedAt: null
      });
      dayOffset += Math.max(1, Math.round((t.minutes || sessionMinutes) / dailyMinutes));
    }
  }
  return { summary: aiResponse.summary, tasks };
}

function generateLocalRoadmap(roleKey, roleName, level, knownSkills, dailyMinutes) {
  const preset = PRESET_ROLES[roleKey] || {
    name: roleName,
    skills: ["Core Principles", "Industry Tools", "Application Architecture", "Testing & Debugging", "Portfolio Building"],
    capstone: "Full-scale end-to-end practical project"
  };

  const knownSet = new Set(
    (knownSkills || "").toLowerCase().split(/[\s,]+/).filter(Boolean)
  );

  const phases = [
    {
      name: "Phase 1: Foundations & Core Concepts",
      skills: preset.skills.slice(0, 3)
    },
    {
      name: "Phase 2: Deep Dive & Practical Workflows",
      skills: preset.skills.slice(3, 7)
    },
    {
      name: "Phase 3: Production Capstone Project",
      skills: preset.skills.slice(7)
    },
    {
      name: "Phase 4: Interview & Placement Readiness",
      skills: ["System Design & Architecture", "High-Frequency Technical Questions", "Resume & Project Presentation"]
    }
  ];

  const tasks = [];
  const sessionMinutes = Math.min(45, dailyMinutes);
  let dayOffset = 0;

  for (const phase of phases) {
    for (const skill of phase.skills) {
      const isKnown = knownSet.has(skill.toLowerCase());
      const prefix = isKnown ? "Deepen & benchmark" : level === "beginner" ? "Master fundamentals of" : "Implement advanced scenarios in";

      tasks.push({
        id: uid(),
        phase: phase.name,
        title: `${prefix} ${skill}`,
        minutes: sessionMinutes,
        type: "concept",
        learningOutcome: `Gain practical fluency in ${skill}`,
        scheduled: addDays(dateKey(), dayOffset),
        done: false,
        completedAt: null
      });

      tasks.push({
        id: uid(),
        phase: phase.name,
        title: `Hands-on mini-lab: Build with ${skill}`,
        minutes: sessionMinutes,
        type: "exercise",
        learningOutcome: `Solidify understanding by writing clean, tested code`,
        scheduled: addDays(dateKey(), dayOffset + 1),
        done: false,
        completedAt: null
      });

      dayOffset += 2;
    }
  }

  // Capstone & placement additions
  tasks.push({
    id: uid(),
    phase: "Phase 3: Production Capstone Project",
    title: `Architect & scaffold capstone: ${preset.capstone || "Target Role Project"}`,
    minutes: sessionMinutes,
    type: "project",
    learningOutcome: "Build a production-ready resume centerpiece",
    scheduled: addDays(dateKey(), dayOffset),
    done: false,
    completedAt: null
  });

  tasks.push({
    id: uid(),
    phase: "Phase 4: Interview & Placement Readiness",
    title: `Simulate full technical mock interview for ${roleName}`,
    minutes: sessionMinutes,
    type: "interview",
    learningOutcome: "Evaluate technical clarity, problem-solving, and communication",
    scheduled: addDays(dateKey(), dayOffset + 3),
    done: false,
    completedAt: null
  });

  return {
    summary: `Structured step-by-step syllabus for ${roleName} engineered around your daily ${dailyMinutes}-minute commitment.`,
    tasks
  };
}
