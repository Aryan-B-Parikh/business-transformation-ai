/** Object storage adapter. Production never falls back to process memory. */
import { v4 as uuidv4 } from "uuid";
import { getS3Client } from "./s3Client";
import { PutObjectCommand,GetObjectCommand,DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
interface StoredFile{id:string;buffer:Buffer;filename:string;mimetype:string;size:number;createdAt:string;orgId:string;}
const memoryFiles=new Map<string,StoredFile>();
const isTest=()=>process.env.NODE_ENV==="test"||process.env.VITEST==="true";
async function putObject(orgId:string,prefix:string,buffer:Buffer,filename:string,mimetype:string){const fileId=uuidv4(),s3=getS3Client();if(s3){const bucket=process.env.S3_BUCKET!,key=`${orgId}/${prefix}/${fileId}`;await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:buffer,ContentType:mimetype,Metadata:{filename:Buffer.from(filename).toString("base64")}}));return{fileId,storageUrl:`s3://${bucket}/${key}`,key};}if(!isTest())throw new Error("CRITICAL STORAGE INVARIANT: object storage unavailable outside tests");memoryFiles.set(fileId,{id:fileId,buffer,filename,mimetype,size:buffer.length,createdAt:new Date().toISOString(),orgId});return{fileId,storageUrl:`memory://${prefix}/${fileId}`,key:`memory://${prefix}/${fileId}`};}
export async function storeFile(orgId:string,buffer:Buffer,filename:string,mimetype:string){return putObject(orgId,"documents",buffer,filename,mimetype);}
export async function storeExport(orgId:string,buffer:Buffer,filename:string,mimetype:string){return putObject(orgId,"exports",buffer,filename,mimetype);}
export async function deleteFile(orgId:string,storageUrl:string){const s3=getS3Client();if(s3&&storageUrl.startsWith("s3://")){const bucket=process.env.S3_BUCKET!,prefix=`s3://${bucket}/`,key=storageUrl.slice(prefix.length);if(!key.startsWith(`${orgId}/`))throw new Error("Tenant isolation violation");await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));return;}if(isTest()){const m=storageUrl.match(/^memory:\/\/[^/]+\/([^/]+)$/);if(m)memoryFiles.delete(m[1]!);return;}throw new Error("Object storage unavailable");}
export async function generateSignedUrl(documentId:string,orgId:string,storageUrl:string){const s3=getS3Client();if(s3&&storageUrl.startsWith("s3://")){const bucket=process.env.S3_BUCKET!,prefix=`s3://${bucket}/`,key=storageUrl.slice(prefix.length);if(!key.startsWith(`${orgId}/`))throw new Error("Tenant isolation violation");return getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:900});}if(isTest())return `/api/v1/documents/${documentId}/file`;throw new Error("Object storage unavailable");}
export function getMemoryFile(fileId:string){if(!isTest())return undefined;return memoryFiles.get(fileId);}
export function clearStorage(){if(isTest())memoryFiles.clear();}
