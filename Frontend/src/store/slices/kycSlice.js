import { createSlice } from '@reduxjs/toolkit';

const kycSlice = createSlice({
    name: 'kyc',
    initialState: {
        step: 1,
        data: {},
        loading: false,
        error: null,
    },
    reducers: {
        // Add reducers
    },
});

export default kycSlice.reducer;
