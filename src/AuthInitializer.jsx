import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {  logout } from './store/authSlice';

function AuthInitializer({ children }) {

    console.log(
        'AuthInitializer: isAuthenticated, Token, expiresAt',
        useSelector(state => state.auth.isAuthenticated),
        useSelector(state => state.auth.accessToken ? '***' : null),
        useSelector(state => state.auth.expiresAt)
    );
    

    const dispatch = useDispatch();

    const { isAuthenticated, expiresAt } = useSelector(
        state => state.auth
    );

    useEffect(() => {
        if (!isAuthenticated) 
            return;
        

        if (!expiresAt || Date.now() >= expiresAt) 
            dispatch(logout());
        

        // authentication logic here

    }, [isAuthenticated, expiresAt, dispatch]);

        /**

        if (!refreshToken) {
            dispatch(logout());
            return;
        }

        const timeUntilExpiration = expiresAt - Date.now();

        const refreshTime = timeUntilExpiration - 60000;


        if (refreshTime <= 0) {

            dispatch( refreshAccessToken() );
            return;

        }


        const timer = setTimeout(() => {
            dispatch( refreshAccessToken() );
        }, refreshTime);


        return () => {
            clearTimeout(timer);
        };

    },
     */
    
        
        
    


    return children;
}

export default AuthInitializer;