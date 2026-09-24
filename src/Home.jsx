import React, { useEffect, useState } from 'react';
import axios from 'axios'
import { useDispatch } from 'react-redux';
import { useNavigate } from "react-router-dom";
import { logout } from './store/authSlice';

const EmbeddedMessaging = () => {
  useEffect(() => {
    // 1. Clear sessions and set test variables
     
	  Object.keys(sessionStorage).forEach(key => { if (key !== 'auth') { sessionStorage.removeItem(key); }});
    localStorage.setItem("sf_context_id", "q8h000067759006AAA");
    localStorage.setItem("sf_user_email", "ali@test.com");
    localStorage.setItem("sf_agent_output", "Agent Output");
    localStorage.setItem("sf_login_counts", "5");
    localStorage.setItem("sf_test_email", "ali@test.com");


    // 2. Event Listener (Direct key-value map for Salesforce MIAW)
    const handleReady = () => {
      console.log("Salesforce Messaging API is fully ready.");
      const fields = {
        ContextRecordId: localStorage.getItem("sf_context_id") || "test1",
        userEmail: localStorage.getItem("sf_user_email") || "test2",
        PromptTemplateOutput: localStorage.getItem("sf_agent_output") || "test3",
        loginTimes: localStorage.getItem("sf_login_counts") || "test4",
        _Email: localStorage.getItem("sf_test_email") || "test5"
      };
      console.log("Prechat fields payload to register:", fields);
      try {
        window.embeddedservice_bootstrap.prechatAPI.setHiddenPrechatFields(fields);
        console.log("Hidden fields safely registered!");
      } catch (e) {
        console.error("Failed to execute setHiddenPrechatFields:", e);
      }
    };

    // Removed { once: true } to let React cleanup handle it cleanly
    window.addEventListener("onEmbeddedMessagingReady", handleReady);

    // 3. Define Initialization
    window.initEmbeddedMessaging = function () {
      try {
        window.embeddedservice_bootstrap.settings.language = "en_US";
        window.embeddedservice_bootstrap.init(
          "00Dg500000A4orh",
          "demo_app",
          "https://orgfarm-e307e8ad28-dev-ed.develop.my.site.com/ESWdemoapp1779691368535",
          {
            scrt2URL: "https://orgfarm-e307e8ad28-dev-ed.develop.my.salesforce-scrt.com"
          }
        );
        console.log("Bootstrap Init invoked.");
      } catch (err) {
        console.error("INIT ERROR", err);
      }
    };

    // 4. Script Injection
    const scriptSrc = "https://orgfarm-e307e8ad28-dev-ed.develop.my.site.com/ESWdemoapp1779691368535/assets/js/bootstrap.min.js";
    let script = document.querySelector(`script[src="${scriptSrc}"]`);

    if (!script) {
      script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      script.onload = () => {
        if (window.embeddedservice_bootstrap && window.initEmbeddedMessaging) {
          window.initEmbeddedMessaging();
        }
      };
      document.body.appendChild(script);
    } else {
      if (window.embeddedservice_bootstrap && window.initEmbeddedMessaging) {
        window.initEmbeddedMessaging();
      }
    }


    // 5. Cleanup
    return () => {
      window.removeEventListener("onEmbeddedMessagingReady", handleReady);
      delete window.initEmbeddedMessaging;
    };
  }, []);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");


  const dispatch = useDispatch();
  const navigate = useNavigate();
  // const { isAuthenticated } = useSelector( state => state.auth );

  const handleClick = async () => {
      try {
          await axios.post(`${import.meta.env.VITE_BACKEND_ENDPOINT}/normalValue`, { clientId, clientSecret });
          console.log("Client ID and Secret sent successfully.");
          
      } catch (error) {
          console.error("Error:", error);
      }
  };

  const handleClickLogout = async () => {
      try {
          const result = await dispatch( logout() );
          if(result){
              navigate('/login');
          }
          
      } catch (error) {
          console.error("Error:", error);
      }
  };
    



  return <div id="messaging-container" >
            
    This is HOME

    
    <br/>
    

    <input
    type="text"
    placeholder="Client ID"
    value={clientId}
    onChange={(e) => setClientId(e.target.value)}/>

  <input  
    type="password"
    placeholder="Client Secret"
    value={clientSecret}
    onChange={(e) => setClientSecret(e.target.value)}/>


    <button onClick={handleClick}>
        Click Me
    </button>


    <button onClick={handleClickLogout}>
        Logout
    </button>

    </div>
    
};

export default EmbeddedMessaging;