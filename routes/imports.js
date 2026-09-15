const router=require('express').Router();
const service=require('../services/youtube-import').createImportService(require('../db'));
router.get('/capabilities',(req,res)=>res.json(service.capabilities()));
router.get('/',(req,res)=>res.json(service.list()));
router.post('/youtube',(req,res)=>{
  try{const result=service.create(req.body?.url);res.status(result.existing?200:202).json(result);}
  catch(error){res.status(error.status||400).json({error:error.message});}
});
router.get('/:id',(req,res)=>{const job=service.get(req.params.id);job?res.json(job):res.status(404).json({error:'Không tìm thấy lượt chuyển đổi.'});});
router.delete('/:id',async(req,res,next)=>{
  try{const job=await service.cancel(req.params.id);job?res.json(job):res.status(404).json({error:'Không tìm thấy lượt chuyển đổi.'});}catch(error){next(error);}
});
module.exports={router,service};
