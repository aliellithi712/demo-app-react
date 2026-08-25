import { Navigate, Outlet } from 'react-router-dom';

import { useSelector } from 'react-redux';

function ProtectedRoute() {

    console.log(' I am in protected ');
    
    const isAuthenticated = useSelector(
        state => state.auth.isAuthenticated
    );

    if (!isAuthenticated) {
      return (
            <Navigate
                to="/login"
                replace
            />
        );
    }

    return <Outlet />;
}

export default ProtectedRoute;