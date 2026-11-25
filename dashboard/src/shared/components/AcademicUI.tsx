import {useEffect,useRef,useState,type InputHTMLAttributes,type ReactNode} from "react";
import { BookIcon } from "../../components/icons";

export function SchoolMark(){return <span className="school-mark" aria-hidden="true"><BookIcon width={23} height={23}/></span>}
export function PageHeader({title,description}:{title:string;description:string}){
  return <header className="page-intro"><h1>{title}</h1><p>{description}</p></header>;
}
export function PasswordInput(props:InputHTMLAttributes<HTMLInputElement>){
  const [visible,setVisible]=useState(false);
  return <span className="password-field"><input {...props} type={visible?"text":"password"}/><button type="button" aria-label={visible?"Hide password":"Show password"} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?"Hide":"Show"}</button></span>;
}
export function Dialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return ()=>dialog?.close()},[]);
  return <dialog className="academic-dialog school" ref={ref} onCancel={close} aria-label={title}>{children}</dialog>
}
export function PortalShell<K extends string>({portal,name,items,active,navigate,tools,footer,children}:{
  portal:string;name:string;items:readonly (readonly [K,string])[];active:K;navigate:(key:K)=>void;tools?:ReactNode;footer:ReactNode;children:ReactNode
}){
  const [expanded,setExpanded]=useState(false);
  return <div className="academic-shell"><a className="skip-link" href="#learning-content">Skip to content</a>
    <aside className="academic-rail"><div className="school-brand"><SchoolMark/><div><strong>ILA</strong><small>Lecture Assistant</small></div>
    <button type="button" className="menu-toggle" aria-expanded={expanded} aria-controls="school-nav" onClick={()=>setExpanded(!expanded)}>Menu</button></div>
    <div id="school-nav" className={expanded?"rail-body expanded":"rail-body"}><nav aria-label={portal+" navigation"}>{items.map(([key,label])=><button type="button" key={key} aria-current={key===active?"page":undefined} onClick={()=>{navigate(key);setExpanded(false);window.scrollTo(0,0)}}>{label}</button>)}</nav><div className="rail-footer">{footer}</div></div></aside>
    <div className="academic-main"><header className="academic-mast"><strong>{portal} portal</strong><div className="mast-tools">{tools}<span className="mast-name">{name}</span></div></header>
    <main id="learning-content" tabIndex={-1} className="learning-content">{children}</main></div></div>
}
export function Form({children,...props}:React.FormHTMLAttributes<HTMLFormElement>){
  const [error,setError]=useState("");
  return <form {...props} onInvalid={e=>{
    const control=e.target as HTMLInputElement;
    if(control===control.form?.querySelector(":invalid")){
      const label=control.labels?.[0]?.firstChild?.textContent?.trim() || "Field";
      setError(label+" — "+control.validationMessage);
    }
  }} onInput={()=>setError("")}>{children}{error && <p role="alert">{error}</p>}</form>;
}
export function Table({children, label}:{children:ReactNode;label:string}){
  return <div className="table-scroll" role="region" aria-label={label} tabIndex={0}><table>{children}</table></div>
}
export function EmptyState({children}:{children:ReactNode}){return <p className="empty-state-text">{children}</p>}
export function LoadingState({children}:{children:ReactNode}){return <div role="status" className="loading-skeleton"><span/>{children}</div>}
export function Notice({children}:{children:ReactNode}){return <p role="status" className="academic-notice">{children}</p>}
export function Button(props:React.ButtonHTMLAttributes<HTMLButtonElement>){return <button type="button" {...props}/>}
