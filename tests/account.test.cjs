const {test}=require('node:test');const assert=require('node:assert/strict');const React=require('react');const {load}=require('./helpers.cjs');
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
function component(auth,states=[],globals={}){let index=0;const updates=[];const fakeReact={...React,useEffect:()=>{},useState:initial=>{const current=index++;return [states[current]===undefined?initial:states[current],value=>updates.push({current,value})];}};return {Component:load('src/components/AccountPanel.tsx',{'react':fakeReact,'./Auth':{useAuth:()=>auth}},globals).default,updates};}
test('email link requests use only the user email and fixed same-origin callback',async()=>{
 let submitted;const {Component,updates}=component({configured:true,loading:false,user:null,client:{auth:{signInWithOtp:async input=>{submitted=input;return {error:null};}}}},['owner@example.com'],{window:{location:{origin:'https://novapulse.example'}}});
 const tree=Component({busy:false,lock:()=>{}}),form=find(tree,node=>node.type==='form');await form.props.onSubmit({preventDefault(){}});
 assert.equal(submitted.email,'owner@example.com');assert.equal(submitted.options.emailRedirectTo,'https://novapulse.example/auth/callback');assert.equal(Object.keys(submitted).sort().join(','),'email,options');assert.ok(updates.some(row=>row.current===4&&row.value===60));
});
test('invalid email or unconfigured sign-in never calls the provider',async()=>{
 for(const configured of [false,true]){let sent=false;const {Component}=component({configured,loading:false,user:null,client:{auth:{signInWithOtp:async()=>{sent=true;}}}},['bad-email']);const form=find(Component({busy:false,lock:()=>{}}),node=>node.type==='form');await form.props.onSubmit({preventDefault(){}});assert.equal(sent,false);}
});
test('sign-out locks the vault before contacting the provider even if sign-out fails',async()=>{
 const events=[];const {Component,updates}=component({configured:true,user:{email:'owner@example.com'},client:{auth:{signOut:async()=>{events.push('provider');return {error:true};}}}});
 const button=find(Component({busy:false,lock:()=>events.push('lock')}),node=>node.props?.onClick&&String(node.props.children).includes('lock vault'));assert.ok(button);await button.props.onClick();assert.equal(events.join(','),'lock,provider');assert.ok(updates.some(row=>typeof row.value==='string'&&row.value.includes('could not be confirmed')));
});
test('auth configuration refuses secret client keys and insecure external endpoints',()=>{
 const {authConfigured}=load('src/lib/config.ts',{}, {atob});
 assert.equal(authConfigured('https://project.supabase.co','sb_secret_private'),false);assert.equal(authConfigured('http://external.example','public'),false);assert.equal(authConfigured('http://localhost:54321','public'),true);
 const jwt=role=>'eyJ.test'.replace('test',Buffer.from(JSON.stringify({role})).toString('base64url'))+'.sig';
 assert.equal(authConfigured('https://project.supabase.co',jwt('service_role')),false);assert.equal(authConfigured('https://project.supabase.co',jwt('anon')),true);
});
