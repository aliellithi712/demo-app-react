import express from "express";
import cors from "cors";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASEKEY);

// Helper function to fetch a single Salesforce Core OAuth Access Token
const getSalesforceCoreToken = async () => {
    const authParams = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.SF_CLIENT_ID,
        client_secret: process.env.SF_CLIENT_SECRET
    });

    const authResponse = await axios.post(
        'https://orgfarm-e307e8ad28-dev-ed.develop.my.salesforce.com/services/oauth2/token', 
        authParams,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    return authResponse.data; // Contains access_token and instance_url
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

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        console.log('FIRST');
        console.log(email , ' ' , password);
        
        // 1. Authenticate via Supabase
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return res.status(401).json({ error: error.message });
        console.log('SECOND');

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

        console.log('jere ' , process.env.AUTH0_CLIENT_ID);
        

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

        const token = await response.json();
        
        return res.status(200).json({
            message: "Login successful",
            user: email,
            data: 'Success',
            sfSession: sfInitResponse.data,
            token: token
        });

    } catch (err) {
        console.error('Login Pipeline Exception Failure:', err.response ? err.response.data : err.message);
        return res.status(500).json({ error: 'Internal server initialization error.' });
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