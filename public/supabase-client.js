import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
export const URL='https://ipqawywfqydgyabcynbh.supabase.co';
export const KEY='sb_publishable_pEJ3XB9-fo8imXaLxWLv2g_Ru3qXg3K';
export const client=createClient(URL,KEY);
export const imageURL=path=>`${URL}/storage/v1/object/public/catalog-images/${path.split('/').map(encodeURIComponent).join('/')}`;
