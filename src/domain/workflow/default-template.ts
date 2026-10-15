import { uid,now,type WorkflowTemplate,type ProjectSnapshot } from '../../shared/model';
export const STAGES=[['立項','DEVELOPMENT','#f4b65f'],['內容','STORY & SCRIPT','#aa95f5'],['製作','PRODUCTION','#69c4bd'],['後期','POST-PRODUCTION','#80b4ee'],['發行','DISTRIBUTION','#ec93ad']];
export const STEPS=[['市場驗證','比較競品，驗證受眾與製作預算'],['題材定位','鎖定故事方向、目標市場與觀眾'],['小說創作','從靈感到世界觀、人物與章節'],['劇本改編','把故事寫成可執行的分集劇本'],['分鏡表','安排景別、運鏡與每一個鏡頭'],['角色聖經','建立全劇一致的角色與場景資產'],['關鍵幀','構圖、站位與首尾幀設計'],['AI 影片','管理鏡頭片段、候選版本與退件'],['聲音','配音、音樂與環境音效'],['剪輯合成','鏡頭排序、節奏與母版管理'],['多語本地化','術語、創譯、字幕與語言版本'],['合規審核','確認素材權利與平台政策'],['發行投流','準備封面、排程與發行包'],['數據復盤','比較留存、成本與下一次的改進']];
export function createDefaultTemplate():WorkflowTemplate{
 const counts=[2,3,4,3,2];let index=0;
 const t:WorkflowTemplate={id:uid(),version:1,acts:[],steps:[],edges:[]};
 STAGES.forEach(([title,,color],a)=>{const act={id:uid(),title,color,stepIds:[] as string[]};for(let j=0;j<counts[a];j++){const n=index++;const step={id:uid(),key:String(n+1).padStart(2,'0') as '01',actId:act.id,title:STEPS[n][0],description:STEPS[n][1],archived:false,custom:false};act.stepIds.push(step.id);t.steps.push(step);}t.acts.push(act);});
 t.steps.slice(1).forEach((s,i)=>t.edges.push({from:t.steps[i].id,to:s.id}));return t;
}
export function newProject(name:string):ProjectSnapshot{return {project:{id:uid(),name,createdAt:now(),schemaVersion:1,backupRetention:10},template:createDefaultTemplate(),revisions:[],assets:[],reviews:[],localeVariants:[],toolBindings:[],episodes:[],scenes:[],shots:[],shotGroups:[],characters:[],costs:[],releases:[],metrics:[],canvas:{positions:{},collapsedActs:[],viewport:{x:0,y:0,zoom:1}}};}
