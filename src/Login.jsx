// import React, { useState } from "react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
// import axios from 'axios'
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from 'react-redux';
import { login } from './store/authSlice';

function Login() {

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const { isAuthenticated } = useSelector( state => state.auth );

    const [email, setEmail] = useState()
    const [password, setPassword] = useState()

    const handleSubmit = async (e) => {
        e.preventDefault()

        const result = await dispatch( login({ email, password }) );
        if (login.fulfilled.match(result)) {
            navigate('/home');
        }
    };

    useEffect(() => {
    if (isAuthenticated) 
        navigate('/home', { replace: true });
    
    }, [isAuthenticated, navigate]);


    /**
    axios.post(`${import.meta.env.VITE_BACKEND_ENDPOINT}/login`, { email, password })
    .then(result => {
        console.log("Full Server Response:", result.data);
        if (result.data.data === "Success") {
            if (result.data.sfSession) {
                localStorage.setItem("sf_context_id", result.data.sfSession.recordid);
                localStorage.setItem("sf_agent_output", result.data.sfSession.output);
                localStorage.setItem("sf_user_email", email);
                localStorage.setItem("sf_login_counts", result.data.sfSession.logincounts);
            }
            navigate("/home");
        }
        else{
            navigate("/register")
            alert("You are not registered to this service")

        }

    })
    .catch(err => console.log(err))
        */

  return (
    <div className="d-flex justify-content-center align-items-center bg-secondary vh-100">
        <div className="bg-white p-3 rounded w-25">
            <h2><center>Login</center></h2>
            <form onSubmit={handleSubmit}>

                <div className="mb-3">
                    <label htmlFor="email">
                        <strong>Email</strong>
                    </label>
                    <input type="text"
                    placeholder='Enter Email'
                    autoComplete='off'
                    name='email'
                    className='form-control rounded-0'
                    onChange={(e) => setEmail(e.target.value)}

                    />
                </div>
                <div className="mb-3">
                    <label htmlFor="email">
                        <strong>Password</strong>
                    </label>
                    <input type="password"
                    placeholder='Enter Password'
                    name='password'
                    className='form-control rounded-0'
                    onChange={(e) => setPassword(e.target.value)}

                    />
                </div>
                <button type="submit" className="btn btn-success w-100 rounded-0">
                    Login
                </button>
                </form>
                <p>Don't have an account?</p>
                <Link to="/register" className="btn btn-default border w-100 bg-light rounded-0 text-decoration-none">
                    Sign Up
                </Link>

        </div>
    </div>
  );
}

export default Login;
