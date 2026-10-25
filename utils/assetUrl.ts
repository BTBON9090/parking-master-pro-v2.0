/** Public assets work at a domain root and under a GitHub Pages project path. */
export function assetUrl(path:string){
 const base=(import.meta as ImportMeta & {env?:{BASE_URL?:string}}).env?.BASE_URL??'/';
 return base+path.replace(/^\//,'');
}
