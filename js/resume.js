/**
 * WegUp AI Resume & ATS Scanner
 * Analyzes resume content against target Job Descriptions, computes ATS match score,
 * identifies critical missing keywords, and rewrites bullet points into STAR/XYZ format.
 */

import { generateGeminiJSON, isLiveAIMode } from "./api.js";
import { uid, getState, saveState, logActivity } from "./state.js";

const COMMON_TECH_KEYWORDS = [
  "javascript", "typescript", "python", "java", "c++", "react", "node.js", "express",
  "next.js", "sql", "postgresql", "mongodb", "redis", "docker", "kubernetes", "aws",
  "gcp", "azure", "git", "github", "ci/cd", "rest api", "graphql", "microservices",
  "html5", "css3", "tailwind", "redux", "jest", "unit testing", "data structures",
  "algorithms", "system design", "agile", "scrum", "linux", "performance optimization"
];

export async function analyzeResumeATS(resumeText, jobDescription, targetRole = "Software Engineer") {
  if (!resumeText || resumeText.trim().length < 50) {
    throw new Error("Please enter a more detailed resume (at least 50 characters).");
  }

  if (isLiveAIMode()) {
    try {
      const prompt = `
You are an expert Technical Recruiter & ATS (Applicant Tracking System) Algorithm Auditor.
Analyze the following student resume against the target role and optional job description.

TARGET ROLE: ${targetRole}
JOB DESCRIPTION:
${jobDescription || "Standard competitive campus placement requirements for " + targetRole}

STUDENT RESUME CONTENT:
${resumeText}

TASK:
1. Compute realistic ATS Match Score (0-100).
2. Extract matched keywords and high-priority MISSING keywords.
3. Identify 2-3 weak bullet points in the resume and rewrite them using the Google "Accomplished [X] as measured by [Y], by doing [Z]" / STAR formula with strong action verbs and quantified impact.
4. Provide formatting and sectioning advice.

Return JSON in this EXACT structure:
{
  "atsScore": 76,
  "matchLevel": "Strong" | "Moderate" | "Needs Improvement",
  "summary": "2 sentences summarizing candidate strengths and resume effectiveness",
  "matchedKeywords": ["React", "JavaScript", "SQL", "Git"],
  "missingKeywords": ["Docker", "Jest/Unit Testing", "CI/CD", "Redis"],
  "bulletImprovements": [
    {
      "original": "Worked on a website project using React and Node",
      "improved": "Architected a responsive full-stack student portal using React and Node.js REST APIs, reducing page load latency by 28%",
      "reason": "Replaced weak passive verb with strong action verb and quantified performance impact."
    }
  ],
  "formattingTips": [
    "Ensure standard headings (Education, Experience, Projects, Skills)",
    "Include live GitHub and deployed project URLs"
  ]
}
`;
      const result = await generateGeminiJSON(prompt, "You are a professional technical talent recruiter and ATS auditor.");
      if (result && typeof result.atsScore === "number") {
        saveScanResult(targetRole, result);
        return result;
      }
    } catch (err) {
      console.warn("Live Gemini ATS scan failed, falling back to local heuristic scan:", err);
    }
  }

  // Smart Heuristic Fallback
  const result = runLocalATSScanner(resumeText, jobDescription, targetRole);
  saveScanResult(targetRole, result);
  return result;
}

function runLocalATSScanner(resumeText, jobDescription, targetRole) {
  const lowerResume = resumeText.toLowerCase();
  const lowerJD = (jobDescription || "").toLowerCase();

  // Extract relevant keywords from JD or default list
  const targetKeywords = COMMON_TECH_KEYWORDS.filter((kw) => 
    lowerJD.includes(kw) || (jobDescription.length < 50 && Math.random() > 0.4)
  );

  const referencePool = targetKeywords.length >= 5 ? targetKeywords : COMMON_TECH_KEYWORDS.slice(0, 15);
  
  const matched = [];
  const missing = [];

  for (const kw of referencePool) {
    if (lowerResume.includes(kw)) {
      matched.push(kw.toUpperCase());
    } else {
      missing.push(kw.toUpperCase());
    }
  }

  // Calculate score
  const matchRatio = matched.length / Math.max(1, referencePool.length);
  const wordCount = resumeText.trim().split(/\s+/).length;
  const lengthScore = Math.min(20, Math.round(wordCount / 15));
  const rawScore = Math.min(95, Math.max(42, Math.round(matchRatio * 70 + lengthScore + 10)));

  return {
    atsScore: rawScore,
    matchLevel: rawScore >= 75 ? "Strong" : rawScore >= 55 ? "Moderate" : "Needs Improvement",
    summary: `Resume shows solid foundational technical terminology for a ${targetRole} fresher. Integrating industry-standard deliverables, test coverage, and measurable metrics will significantly increase recruiter callbacks.`,
    matchedKeywords: matched.slice(0, 10),
    missingKeywords: missing.slice(0, 8),
    bulletImprovements: [
      {
        original: "Created an online web app for college project using HTML, CSS and JavaScript.",
        improved: "Engineered a responsive single-page web platform utilizing modern ES6+ JavaScript, reducing initial render time by 30% for 200+ campus users.",
        reason: "Transformed a vague description into an active technical statement with quantifiable impact."
      },
      {
        original: "Responsible for backend database connection and API routes.",
        improved: "Designed and implemented 12+ RESTful endpoints backed by relational database indexing, cutting query response time by 40%.",
        reason: "Highlights architectural scope and measurable efficiency gains."
      }
    ],
    formattingTips: [
      "Use single-column layout with clean bullet points to pass automated ATS parsers easily.",
      "List technologies under each project headline (e.g. 'Tech Stack: React, Node.js, PostgreSQL').",
      "Include direct clickable links to GitHub repositories and live hosted demos."
    ]
  };
}

function saveScanResult(targetRole, result) {
  const state = getState();
  if (!state.resumeScans) state.resumeScans = [];
  state.resumeScans.unshift({
    id: uid(),
    date: new Date().toISOString(),
    targetRole,
    atsScore: result.atsScore,
    matchLevel: result.matchLevel,
    matchedCount: result.matchedKeywords?.length || 0,
    missingCount: result.missingKeywords?.length || 0
  });
  logActivity(`Scanned resume for ${targetRole} (ATS Score: ${result.atsScore}%)`, "resume");
  saveState();
}
