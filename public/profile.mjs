export function validateProfile(profile){
 if(!profile||typeof profile!=='object'||Array.isArray(profile))throw Error('个人资料格式无效');
 for(const [key,max] of [['school',60],['major',60],['bio',300]])if(profile[key]!=null&&(typeof profile[key]!=='string'||profile[key].length>max))throw Error('个人资料文字过长或格式无效');
 if(profile.avatar){
  if(typeof profile.avatar!=='string'||profile.avatar.length>280000)throw Error('头像过大，请重新选择图片');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(profile.avatar);if(!match)throw Error('头像需要 PNG、JPEG 或 WebP 图片');
  let bytes;try{bytes=atob(match[2]);}catch{throw Error('头像数据无效');}
  if(bytes.length>200000||!(match[1]==='png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='jpeg'?bytes.startsWith('\xff\xd8\xff'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP'))throw Error('头像数据无效');
 }
 return profile;
}
