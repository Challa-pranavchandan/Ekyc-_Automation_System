//require('dotenv').config({path: './env'}) if disturbs the uniformity of
import dotenv from "dotenv"
import connectDB from "./db/index.js";
import { app } from "./app.js";



dotenv.config({
    path: `./.env`
}
)


connectDB()
    .then(() => {
        app.listen(process.env.PORT || 8000, () => {
            console.log(`app is running on port ${process.env.PORT}`);
        })
    })
    .catch((error) => {
        console.error("Failed to connect to DB", error);
        server.close(() => process.exit(1));
    })
















/*;( async () => {
    try{
       await  mongoose.connect(`${process.env.MONGO_URL}/${DB_NAME}`)
       app.on("error",(error)=>{
        console.log("err:",error);
        throw error
       })


       app.listen(process.env.PORT,() => {
        console.log(`app is running on port ${process.env.PORT}`);
       })

    }  catch(error){
        console.error("error",error)
        throw err
    }
}  ) ()*/


