import { z } from 'zod';
export type UUID = string;
export type ProjectHandle = string;
export type Result<T> = {ok:true;value:T}|{ok:false;error:{code:string;message:string}};
export const ok = <T>(value:T):Result<T> => ({ok:true,value});
export const err = (code:string,message:string):Result<never> => ({ok:false,error:{code,message}});
export const uid = () => globalThis.crypto.randomUUID();
export const now = () => new Date().toISOString();
const id = z.uuid();
export const ManifestSchema = z.object({version:z.literal(1),id,name:z.string().min(1).max(200),assets:z.string().min(1).max(240)}).strict();
export type Manifest = z.infer<typeof ManifestSchema>;
export const KINDS = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','text','table','assets','checklist'] as const;
export const RowSchema = z.record(z.string(),z.string());
export const StepContentSchema = z.object({kind:z.enum(KINDS),fields:RowSchema,rows:z.array(RowSchema).max(100000)}).strict();
export type StepContent=z.infer<typeof StepContentSchema>;
export type Row=Record<string,string>;
export const StepSchema=z.object({id,key:z.enum(KINDS),actId:id,title:z.string(),description:z.string(),archived:z.boolean(),custom:z.boolean()});
export type StepDefinition=z.infer<typeof StepSchema>;
export const TemplateSchema=z.object({id,version:z.number().int().positive(),acts:z.array(z.object({id,title:z.string(),color:z.string(),stepIds:z.array(id)})),steps:z.array(StepSchema),edges:z.array(z.object({from:id,to:id}))}).superRefine((t,c)=>{if(new Set(t.steps.map(s=>s.id)).size!==t.steps.length)c.addIssue({code:'custom',message:'Duplicate step IDs'});});
export type WorkflowTemplate=z.infer<typeof TemplateSchema>;
export type Scope={kind:'project'}|{kind:'episode';episodeId:UUID}|{kind:'locale';episodeId:UUID;localeId:UUID};
export const ScopeSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('project')}),z.object({kind:z.literal('episode'),episodeId:id}),z.object({kind:z.literal('locale'),episodeId:id,localeId:id})]);
export const RevisionSchema=z.object({id,stepId:id,scope:ScopeSchema,createdAt:z.string(),content:StepContentSchema,inputs:z.array(id),previousId:id.nullable(),stale:z.boolean()});
export type ArtifactRevision=z.infer<typeof RevisionSchema>;
export const AssetSchema=z.object({id,revisionId:id,relativePath:z.string(),name:z.string(),sha256:z.string(),bytes:z.number(),mime:z.string(),kind:z.enum(['image','video','audio','document']),createdAt:z.string(),durationMs:z.number().nullable(),status:z.enum(['unreviewed','accepted','rejected']),reason:z.string(),rights:z.enum(['unreviewed','licensed','restricted','expired']),licenseNote:z.string(),characterId:z.string().optional(),shotId:z.string().optional(),localeId:z.string().optional()});
export type Asset=z.infer<typeof AssetSchema>;
export const ReviewSchema=z.object({id,gate:z.enum(['G1','G2','G3','G4','G5','G6','G7','G8']),scope:ScopeSchema,revisionIds:z.array(id),approved:z.boolean(),operator:z.string(),note:z.string(),createdAt:z.string()});
export type GateReview=z.infer<typeof ReviewSchema>;
export type Gate=GateReview['gate'];
export const LocaleSchema=z.object({id,tag:z.string(),sourceId:z.string().nullable(),episodeId:z.string(),terms:z.array(RowSchema),cues:z.array(z.object({id,startMs:z.number().int(),endMs:z.number().int(),text:z.string()})),notes:z.string()});
export type LocaleVariant=z.infer<typeof LocaleSchema>;
export type SubtitleCue=LocaleVariant['cues'][number];
export const SnapshotSchema=z.object({
 project:z.object({id,name:z.string(),createdAt:z.string(),schemaVersion:z.literal(1),backupRetention:z.number().int().min(1).max(100)}),
 template:TemplateSchema,revisions:z.array(RevisionSchema),assets:z.array(AssetSchema),reviews:z.array(ReviewSchema),localeVariants:z.array(LocaleSchema),
 toolBindings:z.array(z.object({id,stepId:id,toolId:z.string(),parameters:RowSchema,createdAt:z.string()})),
 episodes:z.array(RowSchema),scenes:z.array(RowSchema),shots:z.array(RowSchema),shotGroups:z.array(RowSchema),characters:z.array(RowSchema),costs:z.array(RowSchema),releases:z.array(RowSchema),metrics:z.array(RowSchema),
 canvas:z.object({positions:z.record(z.string(),z.object({x:z.number(),y:z.number()})),collapsedActs:z.array(z.string()),viewport:z.object({x:z.number(),y:z.number(),zoom:z.number()})})
});
export type ProjectSnapshot=z.infer<typeof SnapshotSchema>;
export const ChangeSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('revision'),stepId:id,scope:ScopeSchema,content:StepContentSchema,inputs:z.array(id),expectedRevisionId:id.nullable()}),
 z.object({type:z.literal('canvas'),canvas:SnapshotSchema.shape.canvas}),
 z.object({type:z.literal('template'),template:TemplateSchema}),
 z.object({type:z.literal('locale'),locale:LocaleSchema}),
 z.object({type:z.literal('review'),gate:ReviewSchema.shape.gate,scope:ScopeSchema,approved:z.boolean(),operator:z.string().min(1),note:z.string()}),
 z.object({type:z.literal('asset'),assetId:id,status:AssetSchema.shape.status,reason:z.string(),rights:AssetSchema.shape.rights,licenseNote:z.string()}),
 z.object({type:z.literal('binding'),stepId:id,toolId:z.string(),parameters:RowSchema}),
 z.object({type:z.literal('records'),collection:z.enum(['episodes','scenes','shots','shotGroups','characters','costs','releases','metrics']),rows:z.array(RowSchema)}),
 z.object({type:z.literal('retention'),count:z.number().int().min(1).max(100)})
]);
export type ProjectChange=z.infer<typeof ChangeSchema>;
export type ValidationIssue={code:string;message:string;stepId?:string};
export const sameScope=(a:Scope,b:Scope)=>JSON.stringify(a)===JSON.stringify(b);
export function latestRevision(s:ProjectSnapshot,stepId:string,scope:Scope={kind:'project'}){return s.revisions.filter(r=>r.stepId===stepId&&sameScope(r.scope,scope)).at(-1);}
