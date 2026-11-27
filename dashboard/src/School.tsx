import {PortalShell,SchoolMark,PasswordInput,Dialog,PageHeader,Form,Table,Notice,Button} from "./shared/components/AcademicUI";
import { useEffect, useState, type FormEvent } from "react";
import { login, request } from "./api";
import type { AuthUser } from "./types";

type Role = "admin" | "teacher" | "student";
const portals = { admin: "Administration", teacher: "Teacher", student: "Student" };
export function PortalLogin({role, success}: {role: Role; success: (user: AuthUser) => void}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try { success((await login({identifier: String(data.get("identifier")), password: String(data.get("password")), role_hint: role})).user); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  return <main className="school entry"><header><SchoolMark/><strong>ILA</strong><span>School learning platform</span></header><section><nav>{(Object.keys(portals) as Role[]).map(r => <a key={r} aria-current={role === r ? "page" : undefined} href={`/${r}/login`}>{portals[r]}</a>)}</nav><h1>{portals[role]} portal</h1><p>Sign in with your school account.</p><Form onSubmit={submit}><label>School ID *<input name="identifier" autoComplete="username" required /></label><label>Password<PasswordInput name="password" autoComplete="current-password" required /></label><Button type="submit" disabled={busy}>{busy?"Signing in…":"Sign in"}</Button></Form><p role="alert">{error}</p></section></main>;
}

type Account = {id?:string; identifier:string; full_name:string;role:"teacher"|"student"; class_level:number;section:string;subject:string;active:boolean;password?:string};
type School = {classes:{class_level:number;name:string;academic_year:string}[];users:Account[]; sections:{class_level:number;name:string}[];subjects:{class_level:number;code:string;name:string}[]};
const blank: Account = {identifier:"",full_name:"",role:"student",class_level:10,section:"A",subject:"",active:true};
export function Administration({logout,name}:{logout:()=>void;name:string}) {
  const [school,setSchool] = useState<School>({classes:[],users:[],sections:[],subjects:[]});
  const [tab,setTab] = useState("Overview");
  const [item,setItem] = useState<Account>(blank);
  const [message,setMessage] = useState("");
  const [editing,setEditing] = useState(false);
  const [addingClass,setAddingClass] = useState(false);
  const refresh = async () => setSchool(await request<School>("/api/admin/school"));
  useEffect(()=>{refresh().catch(e=>setMessage(String(e)));},[]);
  const field = <K extends keyof Account>(key:K,value:Account[K])=>setItem(old=>({...old,[key]:value}));
  const role = tab==="Teachers"?"teacher":"student";
  const levels = school.classes.map(c=>c.class_level);
  const availableClassLevels = [9,10,11,12].filter(level=>!levels.includes(level));
  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      if(tab==="Classes & Sections") await request("/api/admin/sections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({class_level:Number(form.get("level")),name:form.get("name")})});
      else await request("/api/admin/accounts"+(item.id?"/"+item.id:""),{method:item.id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...item,password:item.password || null})});
      await refresh(); setEditing(false); setMessage("Changes saved.");
    } catch(err){setMessage(String(err));}
  }
  async function saveClass(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await request("/api/admin/classes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({class_level:Number(form.get("level")),name:form.get("name"),academic_year:form.get("year")})});
      await refresh(); setAddingClass(false); setMessage("Class added with section A.");
    } catch(err){setMessage(String(err));}
  }
  async function deleteAccount(account: Account) {
    if (!account.id) {
      setMessage("Cannot delete this account because its ID is unavailable.");
      return;
    }
    const relatedData = account.role==="teacher"
      ? "Their lessons, assignments, and student activity or quiz records linked to those lessons will also be permanently deleted."
      : "Their learning progress and activity will also be permanently deleted.";
    if (!window.confirm(`Permanently delete ${account.full_name} (${account.identifier})? ${relatedData} This cannot be undone.`)) return;
    try {
      await request<{status:string}>(`/api/admin/accounts/${encodeURIComponent(account.id)}`,{method:"DELETE"});
      if (item.id===account.id) setEditing(false);
      await refresh();
      setMessage(`${account.role==="teacher"?"Teacher":"Student"} deleted.`);
    } catch(err){setMessage(String(err));}
  }
  const descriptions:Record<string,string>={"Overview":"Enrollment and teaching across your school.","Classes & Sections":"Manage academic years, classes and their sections.",Students:"Enroll students and manage their school accounts.",Teachers:"Manage faculty accounts and their class, section and subject."};
  return <PortalShell portal="Administration" name={name} items={Object.keys(descriptions).map(k=>[k,k] as const)} active={tab} navigate={t=>{setTab(t);setEditing(false);setAddingClass(false);setMessage("")}} footer={<><AccountPassword logout={logout}/><button type="button" onClick={logout}>Sign out</button></>}>
  <div className={`school school-office${tab==="Classes & Sections"?" school-classes":""}`}><PageHeader title={tab==="Overview"?"School overview":tab} description={descriptions[tab]}/><Notice>{message}</Notice>
  {tab==="Overview"?<><dl>{[["Classes",levels.length],["Sections",school.sections.length],["Active students",school.users.filter(u=>u.active && u.role==="student").length],["Active teachers",school.users.filter(u=>u.active && u.role==="teacher").length]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><h2>Class directory</h2><button type="button" onClick={()=>{setTab("Classes & Sections");setAddingClass(true);}}>Add class</button><Table label={tab+" directory"}><thead><tr><th>Class</th><th>Sections</th><th>Active students</th></tr></thead><tbody>{school.classes.map(c=><tr key={c.class_level}><td>{c.name}</td><td>{school.sections.filter(s=>s.class_level===c.class_level).map(s=>s.name).join(", ")}</td><td>{school.users.filter(u=>u.active && u.role==="student" && u.class_level===c.class_level).length}</td></tr>)}</tbody></Table></>:tab==="Classes & Sections"?<><Table label={tab+" directory"}><thead><tr><th>Class</th><th>Sections</th></tr></thead><tbody>{school.classes.map(c=><tr key={c.class_level}><td>{c.name} · {c.academic_year}</td><td>{school.sections.filter(s=>s.class_level===c.class_level).map(s=>s.name).join(", ")}</td></tr>)}</tbody></Table>{addingClass?<Form onSubmit={saveClass}><h2>Add a class</h2><label>Class level<select name="level" required>{availableClassLevels.map(l=><option key={l} value={l}>Class {l}</option>)}</select></label><label>Class name<input name="name" required/></label><label>Academic year<input name="year" required placeholder="2026–2027"/></label><button>Add class</button><button type="button" onClick={()=>setAddingClass(false)}>Cancel</button></Form>:<button type="button" disabled={!availableClassLevels.length} onClick={()=>setAddingClass(true)}>Add class</button>}{!availableClassLevels.length&&<p>All supported classes have been added.</p>}<h2>Add a section</h2><Form onSubmit={save}><label>Class<select name="level">{levels.map(l=><option key={l}>{l}</option>)}</select></label><label>Section name<input name="name" required maxLength={12}/></label><button>Save section</button></Form></>:<>
  <button onClick={()=>{setItem({...blank,role});setEditing(true);}}>Add {role}</button>
  {editing && <Form className="account-form" onSubmit={save}><h2>{item.id?"Edit":"New"} {role}</h2><label>Full name *<input minLength={2} maxLength={100} required value={item.full_name} onChange={e=>field("full_name",e.target.value)}/></label><label>School ID *<input required value={item.identifier} onChange={e=>field("identifier",e.target.value)}/></label><label>{item.id?"Reset password (optional)":"Initial password * (8 or more characters)"}<PasswordInput required={!item.id} minLength={8} autoComplete="new-password" value={item.password||""} onChange={e=>field("password",e.target.value)}/></label><label>Class<select value={item.class_level} onChange={e=>setItem({...item,class_level:Number(e.target.value),section:"A",subject:""})}>{levels.map(l=><option key={l}>{l}</option>)}</select></label><label>Section<select value={item.section} onChange={e=>field("section",e.target.value)}>{school.sections.filter(s=>s.class_level===item.class_level).map(s=><option key={s.name}>{s.name}</option>)}</select></label>{role==="teacher" && <label>Subject *<select required value={item.subject} onChange={e=>field("subject",e.target.value)}><option value="">Choose subject</option>{school.subjects.filter(s=>s.class_level===item.class_level).map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label>}<label>Account status<select value={item.active?"active":"inactive"} onChange={e=>field("active",e.target.value==="active")}><option>active</option><option>inactive</option></select></label><button>Save account</button><button type="button" onClick={()=>setEditing(false)}>Cancel</button></Form>}
  <Table label={tab+" directory"}><thead><tr><th>Name</th><th>School ID</th><th>Class</th><th>Status</th><th>Actions</th></tr></thead><tbody>{school.users.filter(u=>u.role===role).map(u=><tr key={u.id}><td>{u.full_name}</td><td>{u.identifier}</td><td>{u.class_level}{u.section} {u.subject}</td><td>{u.active?"Active":"Inactive"}</td><td><button type="button" onClick={()=>{setItem(u);setEditing(true);}}>Edit</button> <button type="button" onClick={()=>deleteAccount(u)}>Delete</button></td></tr>)}</tbody></Table></>}</div></PortalShell>;
}
export function AccountPassword({logout}:{logout:()=>void}){
  const [open,setOpen]=useState(false);
  const [error,setError]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=new FormData(e.currentTarget);
    try{
      await request("/api/auth/password",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({current_password:form.get("current"),new_password:form.get("next")})});
      logout();
    }catch(err){setError(String(err));}
  }
  return <><button type="button" onClick={()=>setOpen(true)}>Change password</button>{open && <Dialog title="Change password" close={()=>setOpen(false)}><Form onSubmit={submit}><h2>Change password</h2><label>Current password<PasswordInput name="current" autoComplete="current-password" required autoFocus/></label><label>New password<PasswordInput name="next" minLength={8} autoComplete="new-password" required/></label><p role="alert">{error}</p><button>Save and sign in again</button><button type="button" onClick={()=>setOpen(false)}>Cancel</button></Form></Dialog>}</>;
}
