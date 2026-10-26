// Course source is kept in the private access service, outside this public repository.
const path=require('path');
const directory=process.env.STUDYHUB_CONTENT_DIR||path.resolve(__dirname,'../../access-service/content');
module.exports=id=>{
 if(!/^[a-z0-9-]+$/.test(id))throw Error('Invalid course ID');
 return path.join(directory,id+'.json');
};
