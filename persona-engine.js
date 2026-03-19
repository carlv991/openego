const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * OpenEgo Persona Engine
 * Extracts communication patterns from emails to build a user persona
 */

class PersonaEngine {
    constructor() {
        this.persona = {
            // Basic stats
            totalEmails: 0,
            totalWords: 0,
            avgWordsPerEmail: 0,
            
            // Communication style
            style: {
                formality: 0.5, // 0 = casual, 1 = formal
                enthusiasm: 0.5, // 0 = reserved, 1 = enthusiastic
                directness: 0.5, // 0 = indirect, 1 = direct
                emojiUsage: 0,
                exclamationUsage: 0,
            },
            
            // Common phrases
            commonGreetings: {},
            commonSignoffs: {},
            commonPhrases: {},
            transitionWords: {},
            
            // Vocabulary
            vocabulary: {
                uniqueWords: new Set(),
                wordFrequency: {},
                avgWordLength: 0,
            },
            
            // Timing patterns
            responseTime: {
                avg: 0,
                byHour: new Array(24).fill(0),
                byDay: new Array(7).fill(0),
            },
            
            // Topic preferences
            topics: {},
            
            // Sentiment baseline
            sentiment: {
                positive: 0,
                neutral: 0,
                negative: 0,
            },
            
            // Writing patterns
            patterns: {
                usesBulletPoints: false,
                usesNumberedLists: false,
                shortParagraphs: false,
                questionFrequency: 0,
            }
        };
        
        this.stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
            'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
            'from', 'as', 'into', 'through', 'during', 'before', 'after',
            'above', 'below', 'between', 'under', 'again', 'further', 'then',
            'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
            'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
            'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
            'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until',
            'while', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'myself',
            'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself',
            'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
            'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs',
            'themselves', 'what', 'which', 'who', 'whom', 'whose', 'am', 'by'
        ]);
        
        this.greetings = ['hi', 'hello', 'hey', 'dear', 'greetings', 'good morning',
                         'good afternoon', 'good evening', 'morning', 'afternoon'];
        
        this.signoffs = ['best', 'regards', 'sincerely', 'cheers', 'thanks',
                        'thank you', 'yours', 'cordially', 'respectfully', 'talk soon'];
    }

    /**
     * Analyze a single email and extract patterns
     */
    analyzeEmail(email) {
        if (!email || !email.content) return;
        
        this.persona.totalEmails++;
        
        const content = email.content.toLowerCase();
        const lines = email.content.split('\n');
        const words = content.match(/\b\w+\b/g) || [];
        
        // Word count
        this.persona.totalWords += words.length;
        
        // Analyze greetings (first line)
        const firstLine = lines[0]?.toLowerCase() || '';
        this.greetings.forEach(greeting => {
            if (firstLine.includes(greeting)) {
                this.persona.commonGreetings[greeting] = 
                    (this.persona.commonGreetings[greeting] || 0) + 1;
            }
        });
        
        // Analyze signoffs (last few lines)
        const lastLines = lines.slice(-3).join(' ').toLowerCase();
        this.signoffs.forEach(signoff => {
            if (lastLines.includes(signoff)) {
                this.persona.commonSignoffs[signoff] = 
                    (this.persona.commonSignoffs[signoff] || 0) + 1;
            }
        });
        
        // Analyze style markers
        this.analyzeStyleMarkers(content, words);
        
        // Analyze vocabulary
        this.analyzeVocabulary(words);
        
        // Analyze topics
        this.analyzeTopics(content);
        
        // Analyze patterns
        this.analyzePatterns(content, lines);
        
        // Analyze sentiment
        this.analyzeSentiment(content);
    }

    /**
     * Analyze style markers in email
     */
    analyzeStyleMarkers(content, words) {
        // Formality indicators
        const formalWords = ['dear', 'sincerely', 'regards', 'would', 'could', 'please'];
        const casualWords = ['hey', 'hi', 'yeah', 'cool', 'awesome', 'cheers'];
        
        let formalCount = 0;
        let casualCount = 0;
        
        words.forEach(word => {
            if (formalWords.includes(word)) formalCount++;
            if (casualWords.includes(word)) casualCount++;
        });
        
        const totalStyleWords = formalCount + casualCount;
        if (totalStyleWords > 0) {
            this.persona.style.formality = 
                (this.persona.style.formality * (this.persona.totalEmails - 1) + 
                 (formalCount / totalStyleWords)) / this.persona.totalEmails;
        }
        
        // Emoji usage
        const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
        this.persona.style.emojiUsage = 
            (this.persona.style.emojiUsage * (this.persona.totalEmails - 1) + 
             Math.min(emojiCount / words.length * 100, 5)) / this.persona.totalEmails;
        
        // Exclamation usage
        const exclamationCount = (content.match(/!/g) || []).length;
        this.persona.style.exclamationUsage = 
            (this.persona.style.exclamationUsage * (this.persona.totalEmails - 1) + 
             Math.min(exclamationCount / words.length * 100, 10)) / this.persona.totalEmails;
        
        // Enthusiasm (exclamations + positive words)
        const positiveWords = ['great', 'awesome', 'excellent', 'perfect', 'love', 'amazing'];
        const positiveCount = positiveWords.reduce((count, word) => 
            count + (content.split(word).length - 1), 0);
        
        this.persona.style.enthusiasm = 
            (this.persona.style.enthusiasm * (this.persona.totalEmails - 1) + 
             Math.min((exclamationCount + positiveCount) / words.length * 10, 1)) / 
            this.persona.totalEmails;
    }

    /**
     * Analyze vocabulary usage
     */
    analyzeVocabulary(words) {
        words.forEach(word => {
            // Skip stop words for unique vocabulary
            if (!this.stopWords.has(word) && word.length > 2) {
                this.persona.vocabulary.uniqueWords.add(word);
                this.persona.vocabulary.wordFrequency[word] = 
                    (this.persona.vocabulary.wordFrequency[word] || 0) + 1;
            }
        });
        
        // Update average word length
        const totalLength = words.reduce((sum, word) => sum + word.length, 0);
        this.persona.vocabulary.avgWordLength = totalLength / words.length;
    }

    /**
     * Extract topics from email
     */
    analyzeTopics(content) {
        const topicKeywords = {
            'meetings': ['meeting', 'call', 'zoom', 'discuss', 'chat'],
            'deadlines': ['deadline', 'due', 'tomorrow', 'asap', 'urgent', 'today'],
            'proposals': ['proposal', 'quote', 'pricing', 'budget', 'cost'],
            'projects': ['project', 'delivery', 'milestone', 'timeline'],
            'feedback': ['feedback', 'review', 'thoughts', 'opinion'],
            'introductions': ['introduce', 'introduction', 'connect', 'meet'],
            'follow-up': ['follow up', 'following up', 'checking in', 'circling back'],
            'scheduling': ['schedule', 'calendar', 'available', 'free', 'time'],
        };
        
        Object.entries(topicKeywords).forEach(([topic, keywords]) => {
            const matchCount = keywords.reduce((count, keyword) => 
                count + (content.includes(keyword) ? 1 : 0), 0);
            
            if (matchCount > 0) {
                this.persona.topics[topic] = 
                    (this.persona.topics[topic] || 0) + matchCount;
            }
        });
    }

    /**
     * Analyze writing patterns
     */
    analyzePatterns(content, lines) {
        // Bullet points
        if (content.includes('•') || content.includes('- ') || content.includes('* ')) {
            this.persona.patterns.usesBulletPoints = true;
        }
        
        // Numbered lists
        if (/^\d+\./m.test(content)) {
            this.persona.patterns.usesNumberedLists = true;
        }
        
        // Short paragraphs (average < 3 lines per paragraph)
        const paragraphs = content.split('\n\n');
        const avgParagraphLength = paragraphs.reduce((sum, p) => 
            sum + p.split('\n').length, 0) / paragraphs.length;
        
        this.persona.patterns.shortParagraphs = avgParagraphLength < 3;
        
        // Question frequency
        const questionCount = (content.match(/\?/g) || []).length;
        this.persona.patterns.questionFrequency = 
            (this.persona.patterns.questionFrequency * (this.persona.totalEmails - 1) + 
             questionCount) / this.persona.totalEmails;
    }

    /**
     * Simple sentiment analysis
     */
    analyzeSentiment(content) {
        const positiveWords = ['great', 'awesome', 'excellent', 'perfect', 'love', 
                              'amazing', 'fantastic', 'wonderful', 'best', 'happy',
                              'excited', 'looking forward', 'thank you', 'thanks',
                              'appreciate', 'good', 'nice', 'well', 'pleased'];
        
        const negativeWords = ['bad', 'terrible', 'awful', 'worst', 'hate', 'angry',
                              'disappointed', 'frustrated', 'annoying', 'problem',
                              'issue', 'concern', 'unfortunately', 'sorry', 'regret'];
        
        let positive = 0;
        let negative = 0;
        
        positiveWords.forEach(word => {
            positive += (content.split(word).length - 1);
        });
        
        negativeWords.forEach(word => {
            negative += (content.split(word).length - 1);
        });
        
        const total = positive + negative;
        if (total > 0) {
            this.persona.sentiment.positive += positive;
            this.persona.sentiment.negative += negative;
        } else {
            this.persona.sentiment.neutral++;
        }
    }

    /**
     * Generate persona summary for AI training
     */
    generatePersonaProfile() {
        const topGreetings = Object.entries(this.persona.commonGreetings)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([greeting]) => greeting);
        
        const topSignoffs = Object.entries(this.persona.commonSignoffs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([signoff]) => signoff);
        
        const topTopics = Object.entries(this.persona.topics)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([topic]) => topic);
        
        const vocabSize = this.persona.vocabulary.uniqueWords.size;
        
        return {
            summary: {
                totalEmailsAnalyzed: this.persona.totalEmails,
                vocabularySize: vocabSize,
                avgEmailLength: Math.round(this.persona.totalWords / this.persona.totalEmails),
            },
            
            communicationStyle: {
                formality: Math.round(this.persona.style.formality * 100) + '%',
                enthusiasm: Math.round(this.persona.style.enthusiasm * 100) + '%',
                emojiUsage: Math.round(this.persona.style.emojiUsage * 100) + '%',
                exclamationUsage: Math.round(this.persona.style.exclamationUsage * 100) + '%',
            },
            
            preferences: {
                commonGreetings: topGreetings,
                commonSignoffs: topSignoffs,
                frequentTopics: topTopics,
                usesBulletPoints: this.persona.patterns.usesBulletPoints,
                usesEmojis: this.persona.style.emojiUsage > 0.05,
            },
            
            // AI training prompt
            aiPrompt: this.generateAIPrompt(topGreetings, topSignoffs, topTopics)
        };
    }

    /**
     * Generate a training prompt for AI models
     */
    generateAIPrompt(greetings, signoffs, topics) {
        const formality = this.persona.style.formality > 0.6 ? 'formal' : 
                         this.persona.style.formality < 0.4 ? 'casual' : 'professional but friendly';
        
        const enthusiasm = this.persona.style.enthusiasm > 0.5 ? 'enthusiastic' : 'measured';
        
        const emojiNote = this.persona.style.emojiUsage > 0.05 ? 
            'Occasionally uses emojis' : 'Rarely uses emojis';
        
        return `You are writing as someone who communicates in a ${formality}, ${enthusiasm} tone.

WRITING STYLE:
- ${formality.charAt(0).toUpperCase() + formality.slice(1)} tone
- ${this.persona.patterns.shortParagraphs ? 'Uses short, concise paragraphs' : 'Uses detailed paragraphs'}
- ${emojiNote}
- Average email length: ${Math.round(this.persona.totalWords / this.persona.totalEmails)} words

COMMON PHRASES:
- Greetings: ${greetings.join(', ') || 'Hi, Hello'}
- Sign-offs: ${signoffs.join(', ') || 'Best, Thanks'}

FREQUENT TOPICS:
${topics.join(', ') || 'General communication'}

INSTRUCTIONS:
Respond to messages in this style. Match the tone and length of the examples. Use similar greetings and sign-offs. Be concise but friendly.`;
    }

    /**
     * Save persona to disk
     */
    savePersona() {
        try {
            const personaPath = path.join(os.homedir(), '.openego_persona.json');
            const profile = this.generatePersonaProfile();
            
            fs.writeFileSync(personaPath, JSON.stringify({
                timestamp: new Date().toISOString(),
                persona: profile,
                raw: {
                    ...this.persona,
                    vocabulary: {
                        ...this.persona.vocabulary,
                        uniqueWords: Array.from(this.persona.vocabulary.uniqueWords)
                    }
                }
            }, null, 2));
            
            console.log('[PersonaEngine] Persona saved to', personaPath);
            return true;
        } catch (e) {
            console.error('[PersonaEngine] Failed to save persona:', e);
            return false;
        }
    }

    /**
     * Load persona from disk
     */
    loadPersona() {
        try {
            const personaPath = path.join(os.homedir(), '.openego_persona.json');
            
            if (fs.existsSync(personaPath)) {
                const data = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
                console.log('[PersonaEngine] Persona loaded from', personaPath);
                return data;
            }
        } catch (e) {
            console.error('[PersonaEngine] Failed to load persona:', e);
        }
        return null;
    }

    /**
     * Calculate confidence level based on data quantity and quality
     * Returns 0-100 confidence score
     */
    calculateConfidence() {
        let score = 0;
        const p = this.persona;
        
        // Base score from email count (max 40 points)
        // 0 emails = 0, 500+ emails = 40
        const emailScore = Math.min((p.totalEmails / 500) * 40, 40);
        score += emailScore;
        
        // Vocabulary diversity (max 20 points)
        // 100+ unique words = 20 points
        const vocabSize = p.vocabulary.uniqueWords.size;
        const vocabScore = Math.min((vocabSize / 100) * 20, 20);
        score += vocabScore;
        
        // Pattern diversity (max 15 points)
        let patternScore = 0;
        if (Object.keys(p.commonGreetings).length >= 2) patternScore += 5;
        if (Object.keys(p.commonSignoffs).length >= 2) patternScore += 5;
        if (Object.keys(p.topics).length >= 3) patternScore += 5;
        score += patternScore;
        
        // Style consistency (max 15 points)
        // Higher consistency = higher confidence
        const styleVariance = Math.abs(p.style.formality - 0.5) + 
                             Math.abs(p.style.enthusiasm - 0.5);
        const consistencyScore = Math.min(styleVariance * 15, 15);
        score += consistencyScore;
        
        // Response time data (max 10 points)
        const hasTimingData = p.responseTime.byHour.some(h => h > 0);
        if (hasTimingData) score += 10;
        
        return Math.round(score);
    }

    /**
     * Get confidence label and description
     */
    getConfidenceInfo() {
        const score = this.calculateConfidence();
        
        let label, description, color;
        
        if (score < 20) {
            label = 'Just Started';
            description = 'Still learning your style. Use the app more to improve accuracy.';
            color = '#EF4444'; // Red
        } else if (score < 40) {
            label = 'Getting There';
            description = 'Learning your patterns. Keep using OpenEgo to improve.';
            color = '#F59E0B'; // Orange
        } else if (score < 60) {
            label = 'Learning';
            description = 'Getting to know your communication style well.';
            color = '#FBBF24'; // Yellow
        } else if (score < 80) {
            label = 'Confident';
            description = 'Good understanding of your style. Responses should match well.';
            color = '#10B981'; // Green
        } else {
            label = 'Very Confident';
            description = 'Excellent understanding of your communication patterns!';
            color = '#059669'; // Dark Green
        }
        
        return { score, label, description, color };
    }
}

// Export for use in main process
module.exports = { PersonaEngine };
