import mongoose from "mongoose";



const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        
    },
     firstname: {
        type: String,
        required: true,
        trim: true,
        index: true,
     },
      lastname: {
        type: String,
        required: true,
        trim: true,
        index: true,
     },
     
})







export const User = mongoose.model("User", userSchema);