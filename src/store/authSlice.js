import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const savedAuth = sessionStorage.getItem('auth');

console.log('HERE 1');


const initialState = savedAuth
    ? JSON.parse(savedAuth)
    : {
        isAuthenticated: false,
        accessToken: null,
        expiresAt: null,
        user: null,
        loading: false,
        error: null
    };

export const login = createAsyncThunk(
    'auth/login',
    async ({ email, password }, thunkAPI) => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_ENDPOINT}/login`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || 'Login failed'
                );
            }

            return data;

        } catch (error) {
            return thunkAPI.rejectWithValue(error.message);
        }
    }
);

const authSlice = createSlice({
    name: 'auth',

    initialState,

    reducers: {
        logout: (state) => {
            state.isAuthenticated = false;
            state.accessToken = null;
            state.expiresAt = null;
            state.user = null;

            sessionStorage.removeItem('auth');
        }
    },

    extraReducers: (builder) => {

        builder.addCase(login.pending, (state) => {
            state.loading = true;
            state.error = null;
        });

        builder.addCase(login.fulfilled, (state, action) => {

            state.loading = false;
            state.isAuthenticated = true;

            state.accessToken = action.payload.token.access_token;

            state.expiresAt = Date.now() + action.payload.token.expires_in * 1000;

            state.user = action.payload.user;

            // Save authentication
            sessionStorage.setItem(
                'auth',
                JSON.stringify({
                    isAuthenticated: state.isAuthenticated,
                    accessToken: state.accessToken,
                    expiresAt: state.expiresAt,
                    user: state.user
                })
            );
        });

        builder.addCase(login.rejected, (state, action) => {
            state.loading = false;
            state.isAuthenticated = false;
            state.error = action.payload;
        });
    }
});

export const { logout } = authSlice.actions;

export default authSlice.reducer;