import express from "express";
import cors from "cors";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';
import { createClient as createRedisClient } from 'redis';
import { GoogleGenAI } from '@google/genai';
import Groq from "groq-sdk";


dotenv.config();

const app = express();
// app.use(express.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

const groq = new Groq();


const client = createRedisClient({
    username: 'default',
    password: '25R3jF3e51txaDdz0eh9spX78jJGfS3i',
    socket: {
        host: 'peace-willowy-spoon-19833.db.redis.io',
        port: 19271
    }
});

client.on('error', err => console.log('Redis Client Error', err));
await client.connect();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });



export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASEKEY);

// Helper function to fetch a single Salesforce Core OAuth Access Token
const getSalesforceCoreToken = async (flag) => {
    const authParams = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: flag == 'agent' ? process.env.SF_CLIENT_ID : process.env.SFOIDC_CLIENT_ID,
        client_secret: flag =='agent' ? process.env.SF_CLIENT_SECRET : process.env.SFOIDC_CLIENT_SECRET
    });

    const authResponse = await axios.post(
        `${process.env.SF_INSTANCE_URL}/services/oauth2/token`,
        authParams.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if(flag == 'agent' ){
        console.log('setting salesforce_agent_token');
        await client.set('salesforce_agent_token', authResponse.data.access_token);    
    }
    else{
        await client.set('salesforce_core_token', authResponse.data.access_token);
        console.log('setting salesforce_core_token');
    }
    
    return authResponse.data;
};

const getDataCloudToken = async ( coreToken, instanceUrl, retry = true
) => {
    try {
        const exchangeParams = new URLSearchParams({
            grant_type: 'urn:salesforce:grant-type:external:cdp',
            subject_token: coreToken,
            subject_token_type:
                'urn:ietf:params:oauth:token-type:access_token'
        });

        console.log('Exchanging core token for Data Cloud token...');
        const response = await axios.post(
            `${instanceUrl}/services/a360/token`,
            exchangeParams,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        await client.set('data_cloud_token', response.data.access_token);
        await client.set('data_cloud_instance_url', response.data.instance_url);

        return {
            accessToken: response.data.access_token,
            instanceUrl: response.data.instance_url
        };

    } catch (error) {

        if (!retry) {
            throw error;
        }

        const core = await getSalesforceCoreToken();

        return getDataCloudToken( core.access_token, core.instance_url, false );
    }
};


// Asynchronous Data Cloud ingestion engine (Reuses the existing token passed from login)
const ingestToDataCloud = async (userData, coreToken, instanceUrl) => {
    try {
        // Exchange the core token for a Data Cloud specific scope token
        const exchangeParams = new URLSearchParams({
            grant_type: 'urn:salesforce:grant-type:external:cdp',
            subject_token: coreToken,
            subject_token_type: 'urn:ietf:params:oauth:token-type:access_token'
        });

        const exchangeResponse = await axios.post(`${instanceUrl}/services/a360/token`, exchangeParams);
        const { access_token: dataCloudToken, instance_url: dataCloudInstanceUrl } = exchangeResponse.data;

        const [firstRecord, secondRecord] = userData;
        const timestamp = Date.now();

        const firstdata = {
            data: [{ ...firstRecord, uiid: `${firstRecord.email}-${timestamp}` }]
        };

        const seconddata = {
            data: [{ ...secondRecord, uiid: `${secondRecord.email}-${timestamp}` }]
        };

        const headers = {
            'Authorization': `Bearer ${dataCloudToken}`,
            'Content-Type': 'application/json',
            'proxy-force-enabled': 'true'
        };

        // Fire both Data Cloud ingestion endpoints concurrently to save network time
        await Promise.all([
            axios.post(`https://${dataCloudInstanceUrl}/api/v1/ingest/sources/demo_app/UserDLO`, firstdata, { headers }),
            axios.post(`https://${dataCloudInstanceUrl}/api/v1/ingest/sources/demo_app/UserLoginDLO`, seconddata, { headers })
        ]);

        console.log("Data Cloud Ingestion Successful");
    } catch (error) {
        console.error('Data Cloud Error Status:', error.response?.status);
        console.error('Data Cloud Error Detail:', error.response?.data);
    }
};

app.get('/ping', async (req, res) => {
    res.status(201).json('pong');
});

async function getAuth0Token() {
    const response = await fetch(
        `${process.env.AUTH0_DOMAIN}/oauth/token`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                grant_type: 'client_credentials',
                client_id: process.env.AUTH0_CLIENT_ID,
                client_secret: process.env.AUTH0_CLIENT_SECRET,
                audience: process.env.AUTH0_AUDIENCE,
                
            })
        }
    );
    return await response.json();
}

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        console.log(email , ' ' , password);
        
        // 1. Authenticate via Supabase
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return res.status(401).json({ error: error.message });

        // Parse profile names
        const emailParts = email.split('@')[0].split('.');
        const firstName = emailParts[0] || 'Unknown';
        const lastName = emailParts[1] || 'User';

        const userData = {
            email: String(data.user.email),
            first_name: String(firstName),
            last_name: String(lastName)
        };

        const secuserData = {
            uiid: String(data.user.id),
            email: String(data.user.email),
            first_name: String(firstName),
            last_name: String(lastName),
            email_confirmed_at: data.user.confirmed_at ? String(data.user.confirmed_at) : null,
            last_sign_in_at: data.user.last_sign_in_at ? String(data.user.last_sign_in_at) : null,
        };

        // 2. Obtain ONE Shared Salesforce Core Access Token
        const { access_token: coreToken, instance_url: instanceUrl } = await getSalesforceCoreToken();
        
        // 3. Fire Data Cloud Ingestion Asynchronously (No 'await' - let it run in the background)
        ingestToDataCloud([userData, secuserData], coreToken, instanceUrl);

        // 4. Reuse Core Token to Fetch Agent Context from Apex endpoint
        const sfInitResponse = await axios.get(
            `${instanceUrl}/services/apexrest/v1/SessionInit/`,
            {
                headers: {
                    'Authorization': `Bearer ${coreToken}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    userSentence: 'hello',
                    userEmail: email
                }
            }
        );        


        const token = await getAuth0Token();
        
        return res.status(200).json({
            message: "Login successful",
            user: email,
            data: 'Success',
            sfSession: sfInitResponse.data,
            token: token
        });

    } catch (err) {
        console.error('Login Pipeline Exception Failure:', err.response ? err.response.data : err.message);
        return res.status(500).json({
            error: 'Internal server initialization error.',
            details: err.response ? err.response.data : err.message
        });
    }
});

app.get('/auth/salesforce/callback', async (req, res) => {
    const code = req.query.code;
    // print state
    if (!code) {
        return res.status(400).json({ error: "Missing authorization code" });
    }
    try {
        
        const authParams = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: process.env.SFOIDC_CLIENT_ID,
            client_secret: process.env.SFOIDC_CLIENT_SECRET,
            redirect_uri: process.env.SF_REDIRECT_URI,
            code: code,
            code_verifier: process.env.CODE_VERIFIER
        });

        const authResponse = await axios.post(
            `${process.env.SF_INSTANCE_URL}/services/oauth2/token`,
            authParams,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        if(authResponse.status >= 200 && authResponse.status < 300) {
            const auth0Token = await getAuth0Token();
            console.log('Auth0 Token:', auth0Token.access_token);
            res.redirect(`http://localhost:5173/login?token=${auth0Token.access_token}&exp=${auth0Token.expires_in}`);
        }
        else {
            res.status(authResponse.status).json({ error: "Salesforce authentication failed", details: authResponse.data });
        }

        res.send(`Authorization code received successfully: ${code}`);
        
    }
    catch (err) {
        console.error('Salesforce Callback Error:', err.response ? err.response.data : err.message);
        return res.status(500).json({
            error: 'Internal server initialization error.',
            details: err.response ? err.response.data : err.message
        });
    }
});


// start agentforce session

app.post('/api/agentforce/start-session', async (req, res) => {

    const createSession = async (coreToken) => {
        const headers = {
            Authorization: `Bearer ${coreToken}`,
            'Content-Type': 'application/json'
        };

        const body = {
            externalSessionKey: crypto.randomUUID(),
            instanceConfig: {
                endpoint: process.env.SF_INSTANCE_URL
            },
            featureSupport: 'Sync',
            bypassUser: true
        };

        return axios.post(endpoint, body, { headers });
    };


    let coreToken = await client.get('salesforce_agent_token');
    const agentId = process.env.AGENTFORCE_AGENT_ID;
    const endpoint = `https://api.salesforce.com/einstein/ai-agent/v1/agents/${agentId}/sessions`;
    let sessionResponse = null;

    if (!coreToken) {
        try { // NOCORE 
            const tokenData = await getSalesforceCoreToken('agent');
            coreToken = tokenData.access_token;
            sessionResponse = await createSession(coreToken);
        } catch (error) {
            console.error('Failed to obtain Salesforce core token:', error);
        }
    
    }


    else{
        try { // CORE VALID
            sessionResponse = await createSession(coreToken);
        } catch (error) { 
            try {//CORE INVALID

                const tokenData = await getSalesforceCoreToken('agent');
                coreToken = tokenData.access_token;
                sessionResponse = await createSession(coreToken);    
            } catch (error) {
                console.error('Failed to create Agentforce session after refreshing core token:', error);
            }
            
        }
    }

    return res.status(200).json({
        message: 'Agentforce session started successfully',
        data: sessionResponse.data,
        session: sessionResponse.data.sessionId
    });

    
});


app.post('/api/agentforce/message', async (req, res) => {
    try {
        console.log("Starting to process message...");
        
        const { message, attachment } = req.body;
        const { sessionId } = req.body;
        let coreToken = await client.get('salesforce_agent_token');
        
        const headers = { 
            'Authorization': `Bearer ${coreToken}`, 
            'Content-Type': 'application/json' 
        };
        const message_url = `https://api.salesforce.com/einstein/ai-agent/v1/sessions/${sessionId}/messages`;
        const body = {
            "message": {
                "sequenceId": 1,
                "type": "Text",
                "text": message
            }
        };

        const response = await axios.post(message_url, body, { headers });
        res.status(200).json({ 
            message: "Message sent successfully", 
            data: response.data.messages[0].message
        });


    } catch (err) {
        // console.error('Error sending message:', err);
        // res.status(500).json({ error: "Failed to send message", details: err.message });
    }

})

app.post('/api/agentforce/attachment', async (req, res) => {
    try {
        
        let tokenRes = '';
        let coreToken = await client.get('salesforce_core_token');
        let dcToken = await client.get('data_cloud_token');
        let dcInstanceUrl = await client.get('data_cloud_instance_url');

        async function checkValidDcToken(accessToken, instanceUrl) {
        try {
            console.log("Checking validity of Data Cloud token...");
            await axios.get(`${instanceUrl}/api/v1/metadata/`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'a360-data-space': 'default'
            },
            timeout: 5000
            });
            return true;
        } catch (error) {
            if (error.response?.status === 401) {
            return false; // Token is expired or unauthorized
            }
            throw error; // Throw for other network/server errors
        }
        }


        if(!dcToken || !dcInstanceUrl) {
            try {// no Data Cloud Token 
                await getDataCloudToken( coreToken , process.env.SF_INSTANCE_URL );
                dcToken = await client.get('data_cloud_token');
                // const isValid = await checkValidDcToken( dcToken, process.env.SF_INSTANCE_URL );
                // if (!isValid) {
                //     throw new Error('1) Data Cloud token is invalid');
                // }
            } catch (error) {
                console.error('Error obtaining Data Cloud token:', error);
            }
        }
        else{
            try { // Valid data cloud token 
                await getDataCloudToken( coreToken , process.env.SF_INSTANCE_URL );
                dcToken = await client.get('data_cloud_token');
            } catch (error) { // Invalid Data Cloud token

                try {
                    await getDataCloudToken( coreToken , process.env.SF_INSTANCE_URL );
                    dcToken = await client.get('data_cloud_token');
                    // const isValid = await checkValidDcToken( dcToken, dcInstanceUrl );
                    // if (!isValid) 
                    //     throw new Error('3) Data Cloud token is invalid');
                } catch (error) {
                    res.status(500).json({ error: 'Failed to obtain valid Data Cloud token' });
                }
                
            }
        }
            
        console.log("Starting to process attachment...");
        const { message, attachments, sessionId } = req.body;
        
        const attachmentParts = attachments ? attachments.map(att => {
        const matches = att.data.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            return {
            inlineData: {
                mimeType: matches[1],
                data: matches[2]
            }
            };
        }
        return null;
        }).filter(Boolean) : [];


        // MOCK 
        /**
        const candidateId1 = "cand_sarah_1";
        const candidateId2 = "cand_michael_2";

        const date = new Date();
        const gmtDateTime = new Intl.DateTimeFormat('sv-SE', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'GMT'
        }).format(date);

        const candidates = [
            {
                candidate_id: candidateId1,
                full_name: "Sarah DePaul",
                email: "sarah.depaul@depaul.edu",
                phone: "312.362.8437",
                location: { city: "Chicago", state: "IL", country: "US" },
                professional_summary: "Seeking an internship opportunity in corporate finance...",
                role: "Developer",
                created_at: gmtDateTime
            },
            {
                candidate_id: candidateId2,
                full_name: "Michael Scott",
                email: "mscott@dundermifflin.com",
                phone: "570-555-0199",
                location: { city: "Scranton", state: "PA", country: "US" },
                professional_summary: "Regional manager with a proven track record...",
                role: "Developer",
                created_at: gmtDateTime
            }
        ];

        const education = [
            {
                education_id: "edu_1",
                candidate_id: candidateId1,
                degree: "Bachelor of Science in Business",
                field_of_study: "Finance; Minor in Management Information Systems",
                institution_name: "DePaul University, Chicago, IL",
                start_date: "2013-08-01",
                end_date: "2017-06-01"
            },
            {
                education_id: "edu_2",
                candidate_id: candidateId2,
                degree: "High School Diploma",
                field_of_study: "General Studies",
                institution_name: "West Scranton High School",
                start_date: "1980-09-01",
                end_date: "1984-06-01"
            }
        ];

        const workExp = [
            {
                work_experience_id: "work_1",
                candidate_id: candidateId1,
                company_name: "Company 123",
                job_title: "Intern, Finance Department",
                start_date: "2015-06-01",
                end_date: "2015-08-01",
                description: "Prepared weekly and monthly performance reports..."
            },
            {
                work_experience_id: "work_2",
                candidate_id: candidateId1,
                company_name: "Company XYZ",
                job_title: "Finance Intern, Compliance Audit",
                start_date: "2015-03-01",
                end_date: "2015-05-01",
                description: "Audited affiliate division testing 45 samples..."
            },
            {
                work_experience_id: "work_3",
                candidate_id: candidateId1,
                company_name: "Restaurant ABC",
                job_title: "Hostess",
                start_date: "2016-01-01",
                end_date: "Present",
                description: "Efficiently assist 100 clients daily..."
            },
            {
                work_experience_id: "work_4",
                candidate_id: candidateId2,
                company_name: "Dunder Mifflin",
                job_title: "Regional Manager",
                start_date: "1992-03-01",
                end_date: "Present",
                description: "Managed the Scranton branch and inspired people..."
            }
        ];

        const achievements = [
            {
                achievement_id: "ach_1",
                achievementName: "Dean’s List",
                issuing_organization: "DePaul University"
            },
            {
                achievement_id: "ach_2",
                achievementName: "Manager of the Year",
                issuing_organization: "Dunder Mifflin Paper Company"
            }
        ];

        const candidateAchievements = [
            {
                candidateAchievement_id : "cand_ach_1", 
                candidate_id: candidateId1,
                achievement_id: "ach_1"
            },
            {
                candidateAchievement_id : "cand_ach_2", 
                candidate_id: candidateId2,
                achievement_id: "ach_2"
            }
        ];

        const skills = [
            { skill_id: "skill_1", skillName: "Spanish", description: "Fluent in Spanish" },
            { skill_id: "skill_2", skillName: "Bloomberg", description: "Proficient with Bloomberg" },
            { skill_id: "skill_3", skillName: "Microsoft Excel", description: "Proficient with Microsoft Excel" },
            { skill_id: "skill_4", skillName: "Microsoft PowerPoint", description: "Proficient with PowerPoint" },
            { skill_id: "skill_5", skillName: "Python", description: "Proficient with Python" },
            { skill_id: "skill_6", skillName: "Public Speaking", description: "Expert presenter" },
            { skill_id: "skill_7", skillName: "Sales Negotiation", description: "Closing big accounts" },
            { skill_id: "skill_8", skillName: "Improv Comedy", description: "Quick on stage" }
        ];

        const candidateSkills = [
            { candidate_skill_id: "cs_1", candidate_id: candidateId1, skill_id: "skill_1" },
            { candidate_skill_id: "cs_2", candidate_id: candidateId1, skill_id: "skill_2" },
            { candidate_skill_id: "cs_3", candidate_id: candidateId1, skill_id: "skill_3" },
            { candidate_skill_id: "cs_4", candidate_id: candidateId1, skill_id: "skill_4" },
            { candidate_skill_id: "cs_5", candidate_id: candidateId2, skill_id: "skill_6" },
            { candidate_skill_id: "cs_6", candidate_id: candidateId2, skill_id: "skill_7" }
        ];


        const dataCloudToken = await client.get('data_cloud_token');
        
        const headers = {
            Authorization: `Bearer ${dataCloudToken}`,
            'Content-Type': 'application/json',
            'proxy-force-enabled': 'true'
        };

        const axiosConfig = { 
            headers, 
            timeout: 10000
        };
        
        let dataCloudInstanceUrl = await client.get('data_cloud_instance_url');
        console.log('Data Cloud Instance URL:', dataCloudInstanceUrl);
        const baseUrl =`https://${dataCloudInstanceUrl}/api/v1/ingest/sources/cv_parser`;
        await Promise.all([
            axios.post(
                `${baseUrl}/Candidate`,
                {data: candidates},
                 axiosConfig 
            ),

            axios.post(
                `${baseUrl}/CandidateEducation`,
                {data: education},
                axiosConfig 
            ),

            axios.post(
                `${baseUrl}/CandidateWorkExperience`,
                {data: workExp},
                axiosConfig 
            ),

            axios.post(
                `${baseUrl}/Achievement`,
                {data: achievements},
                axiosConfig 
            ),

            axios.post(
                `${baseUrl}/CandidateAchievement`,
                {data: candidateAchievements},
                axiosConfig 
            ),

            axios.post(
                `${baseUrl}/Skill`,
                {data: skills},
                axiosConfig 
            ),

            axios.post(
                `${baseUrl}/CandidateSkill`,
                {data: candidateSkills},
                axiosConfig 
            )
        ]);
        
        console.log("All axios requests completed successfully");
        res.status(200).json({  message: "Attachment processed successfully" });

        */

        // --------------------------------------------------------------------------------

        /** */

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: [message || 'Analyze this attachment', ...attachmentParts],
            config: {
                systemInstruction: `
                You are a high-precision Resume/CV Parsing Engine. Your task is to extract candidate information from the provided Resume/CV text into a strictly valid JSON object following the exact JSON schema below.
                STRICT INSTRUCTION RULES
                OUTPUT ONLY VALID JSON.
                Do not include markdown code blocks.
                Do not include introductory text, explanations, comments, or trailing notes.
                ABSOLUTE ACCURACY.
                Extract ONLY facts directly stated in the provided CV/document.
                Do NOT hallucinate, infer, assume, or extrapolate candidate information.
                Do NOT create information that is not explicitly present.
                TYPO CORRECTION.
                Correct obvious spelling or formatting errors in extracted values when the intended meaning is unambiguous.
                Do not change factual information.
                MISSING DETAILS.
                If a field is not present, set it to null.
                If a list has no applicable information, return [].
                NEVER omit any key defined in the schema.
                SKILLS.
                Extract all explicitly stated technical, domain, and soft skills.
                Store them as a flat string array under "skills".
                Do not infer skills from job titles or responsibilities.
                Extract all explicitly stated technical, domain, and soft skills.
                Each skill must contain:
                "name": the skill name.
                "description": the explicitly stated technologies, capabilities, tools, concepts, or details associated with that skill.
                Do NOT infer descriptions that are not explicitly stated.
                If a skill has no explicitly stated description, set "description" to null.
                Example:
                {
                "name": "Data 360",
                "description": "Ingestion, Mapping, Data Graphs, Calculated Insights, Identity Resolution, Search Index"
                }
                CERTIFICATIONS / ACHIEVEMENTS.
                Extract professional certifications and licenses explicitly stated in the CV.
                Store them under "achievements".
                Do not treat ordinary job responsibilities, awards, projects, or skills as certifications unless explicitly identified as such.
                WORK EXPERIENCE.
                Extract each explicitly stated employment position.
                Preserve the company, title, dates, and description exactly according to the available information.
                If a specific value is missing, use null.
                Do not infer dates or company names.
                - Format all dates (startDate and endDate) strictly as MM/YYYY (e.g., 10/2025).
                - If a position is current or ongoing, set endDate explicitly to "Present".
                - If an end date is missing for an active role, use "Present"; otherwise, default missing past end dates to today's date in MM/YYYY format.
                EDUCATION.
                Extract only explicitly stated education information.
                If a field is missing, use null.
                NOT A RESUME DETECTION.

                If email is null return exactly:
                {"notAResume"}
                This rule takes priority over the normal candidate schema.
                Do not mark a document as not a resume merely because other fields such as skills, education, work experience, or certifications are missing.
                Do not infer an email, phone number, or summary. They must be explicitly present in the document.

                ROLE ASSIGNMENT.
                Extract or classify the candidate's primary professional role based strictly on their experience and background.
                The value for "role" MUST match one of the following exact options: "Admin", "Developer", "HR", "Finance", "Sales", "Marketing", "Support", or "Other".
                If it does not fit any category cleanly, set it to "Other". Do not use any value outside this list.

                If the provided document is clearly NOT a resume/CV, return exactly:
                {"notAResume":true}
                A document should be considered NOT a resume/CV when it is clearly unrelated to a candidate's professional, educational, or career background.
                If the document appears to be a resume/CV but some information is missing, DO NOT return notAResume. Instead, return the required schema with null values and empty arrays where appropriate.
                If you are uncertain whether it is a resume, treat it as a resume and extract the available information.
                NO TRAILING SPACES.
                Do not include unnecessary leading or trailing spaces in any extracted string.
                REQUIRED JSON SCHEMA
                {
                "candidate": {
                "firstName": "String | null",
                "lastName": "String | null",
                "email": "String | null",
                "phone": "String | null",
                "role": "String | null",
                "summary": "String | null",
                "skills": [
                {
                "name": "String | null",
                "description": "String | null"
                }
                ],
                "workExperience": [
                {

                "company": "String | null",
                "JobTitle": "String | null",
                "startDate": "String | null",
                "endDate": "String | null",
                "description": "String | null"
                }
                ],
                "education": [
                {
                "institution": "String | null",
                "degree": "String | null",
                "fieldOfStudy": "String | null",
                "graduationYear": "String | null"
                }
                ],
                "achievements": [
                {
                "name": "String | null",
                "issuingOrganization": "String | null",
                "issueDate": "String | null"
                }
                ]
                }
                }

                FINAL VALIDATION
                Before returning the response:
                Ensure the output is valid JSON.
                Ensure there are no markdown fences.
                Ensure there are no comments.
                Ensure all required schema keys are present when the document is a resume.
                Ensure missing scalar values are null.
                Ensure missing lists are [].
                Ensure there are no trailing spaces.
                Ensure no information was invented.
                Ensure obvious typos are corrected only when the intended value is unambiguous.
                If the document is clearly not a resume/CV, return exactly {"notAResume":true}.
                
                `,
                responseMimeType: 'application/json',
            },
        });
         



        // MOCK
        
        
        // ------------------------------------------------------------------------------


        try {
            const tmp = JSON.parse(response.text);
            const cand = tmp.candidate ?? tmp; // Handles both nested 'candidate' or flat object

            const candidateId = `cand_${Math.random().toString(36).substring(2, 9)}`;

            // 1. Candidate Info
            const candidates = [{
                candidate_id: candidateId,
                created_at: new Date().toISOString(),
                full_name : cand.full_name ?? `${cand.first_name ?? cand.firstName ?? ""} ${cand.last_name ?? cand.lastName ?? ""}`.trim() ?? null,
                email: cand.email ?? null,
                phone: cand.phone ?? null,
                role: cand.role ?? null,
                professional_summary: cand.professional_summary ?? cand.summary ?? null
            }];

            // 2. Skills (nested inside cand.skills)
            const skills = [];
            const candidateSkills = [];
            (cand.skills ?? []).forEach((skill) => {
                const skillName = typeof skill === "string" ? skill : skill?.name ?? skill?.skillName ?? null;
                if (!skillName) return;

                const skillId = `skill_${Math.random().toString(36).substring(2, 9)}`;
                skills.push({ skill_id: skillId, skillName: skillName });
                candidateSkills.push({
                    candidate_skill_id: `candskill_${Math.random().toString(36).substring(2, 9)}`,
                    candidate_id: candidateId,
                    skill_id: skillId
                });
            });

            // 3. Achievements (nested inside cand.achievements)
            const achievements = [];
            const candidateAchievements = [];
            const allAchievements = [
                ...(cand.achievements ?? []),
                ...(cand.certifications ?? [])
            ];

            allAchievements.forEach((ach) => {
                const achName = typeof ach === "string" ? ach : ach?.name ?? ach?.achievementName ?? ach?.title ?? null;
                if (!achName) return;

                const achId = `ach_${Math.random().toString(36).substring(2, 9)}`;
                achievements.push({ achievement_id: achId, achievementName: achName });
                candidateAchievements.push({
                    candidateAchievement_id: `candach_${Math.random().toString(36).substring(2, 9)}`,
                    candidate_id: candidateId,
                    achievement_id: achId
                });
            });

            // 4. Education (nested inside cand.education)
            const education = (cand.education ?? []).map((item) => ({
                education_id: item.education_id ?? `edu_${Math.random().toString(36).substring(2, 9)}`,
                candidate_id: candidateId,
                degree: typeof item === "string" ? item : item?.degree ?? null,
                field_of_study: typeof item === "string" ? null : item?.fieldOfStudy ?? item?.field_of_study ?? null,
                institution_name: typeof item === "string" ? null : item?.institution ?? item?.institution_name ?? null,
                location: typeof item === "string" ? null : item?.location ?? null,
                start_date: typeof item === "string" ? null : item?.startDate ?? item?.start_date ?? null,
                end_date: typeof item === "string" ? null : item?.endDate ?? item?.end_date ?? null,
                gpa: typeof item === "string" ? null : item?.gpa ?? null
            }));

            // 5. Work Experience (nested inside cand.workExperience)
            const workData = cand.workExperience ?? cand.workExp ?? cand.work_experience ?? [];
            const workExp = workData.map((work) => ({
                work_experience_id: work.work_experience_id ?? `work_${Math.random().toString(36).substring(2, 9)}`,
                candidate_id: candidateId,
                job_title: work?.JobTitle ?? work?.job_title ?? work?.title ?? null,
                company_name: work?.company ?? work?.company_name ?? null,
                start_date: work?.startDate ?? work?.start_date ?? null,
                end_date: work?.endDate ?? work?.end_date ?? null,
                is_current: work?.is_current ?? ((work?.endDate ?? work?.end_date ?? '').toLowerCase() === 'present')
            }));

            // Console Log Parsed Arrays for Inspection
            console.log("--- PARSED TOP-LEVEL DATA ---");
            console.log("Candidates:", candidates);
            console.log("Skills:", skills);
            console.log("Candidate Skills:", candidateSkills);
            console.log("Achievements:", achievements);
            console.log("Candidate Achievements:", candidateAchievements);
            console.log("Education:", education);
            console.log("Work Exp:", workExp);
            console.log("-----------------------------");

            // Ingestion to Data Cloud
            const dataCloudToken = await client.get('data_cloud_token');
            const dataCloudInstanceUrl = await client.get('data_cloud_instance_url');
            const cleanInstanceUrl = dataCloudInstanceUrl.replace(/^https?:\/\//, '');
            const baseUrl = `https://${cleanInstanceUrl}/api/v1/ingest/sources/cv_parser`;

            const axiosConfig = {
                headers: {
                    Authorization: `Bearer ${dataCloudToken}`,
                    'Content-Type': 'application/json',
                    'proxy-force-enabled': 'true'
                },
                timeout: 10000
            };

            const requests = [];
            if (candidates.length > 0) requests.push(axios.post(`${baseUrl}/Candidate`, { data: candidates }, axiosConfig));
            if (education.length > 0) requests.push(axios.post(`${baseUrl}/CandidateEducation`, { data: education }, axiosConfig));
            if (workExp.length > 0) requests.push(axios.post(`${baseUrl}/CandidateWorkExperience`, { data: workExp }, axiosConfig));
            if (achievements.length > 0) requests.push(axios.post(`${baseUrl}/Achievement`, { data: achievements }, axiosConfig));
            if (candidateAchievements.length > 0) requests.push(axios.post(`${baseUrl}/CandidateAchievement`, { data: candidateAchievements }, axiosConfig));
            if (skills.length > 0) requests.push(axios.post(`${baseUrl}/Skill`, { data: skills }, axiosConfig));
            if (candidateSkills.length > 0) requests.push(axios.post(`${baseUrl}/CandidateSkill`, { data: candidateSkills }, axiosConfig));

            const results = await Promise.all(requests);
            results.forEach((resItem, idx) => console.log(`Ingestion Result [${idx}]:`, resItem.data));

            res.status(200).json({ 
                message: "Attachment processed successfully", 
                data: response.text 
            });

        } catch (err) {
            console.error('Error sending attachment:', err.message);
            res.status(500).json({ error: "Failed to send attachment", details: err.message });
        }



        
    } catch (err) {
        console.error('Error sending attachment:', err)
        res.status(500).json({ error: "Failed to send attachment", details: err.message });
    }
});

app.post('/api/salesforce/token', async (req, res) => {
    try {
        const authResponse = await axios.post(
        `${process.env.SF_INSTANCE_URL}/services/oauth2/token`,
            null,
            {
                params: {
                    grant_type: 'authorization_code',
                    client_id: process.env.SFOIDC_CLIENT_ID,
                    client_secret: process.env.SFOIDC_CLIENT_SECRET,
                    code: req.body.code,
                    redirect_uri: 'https://37b6-41-237-158-10.ngrok-free.app/auth/salesforce/callback'
                },
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        
        if(authResponse.status >= 200 && authResponse.status < 300) {
            const auth0Token = await getAuth0Token();
            res.json({
                salesforce: authResponse.data,
                auth0: auth0Token
            });
        }
        else {
            res.status(authResponse.status).json({ error: "Salesforce authentication failed", details: authResponse.data });
        }
        
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error: "Salesforce authentication failed", details: err.response?.data || err.message });
    }
});

app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true
    });

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
});

app.post('/normalValue', async (req, res) => {
    const { clientId, clientSecret } = req.body;
    console.log(clientId,clientSecret);
    
    const response = await axios.post( `${process.env.MULE_ENDPOINT}/api/normal-value-events` , {} , {
        headers : {
            client_id: clientId,
            client_secret: clientSecret
        }
    } );
    console.log(response.data)

    res.status(201).json(response.data);
});



app.listen(3001, () => {
    console.log("server is running on port 3001");
});