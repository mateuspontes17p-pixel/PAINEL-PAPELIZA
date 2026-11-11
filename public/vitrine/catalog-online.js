import {startCatalog} from '../catalog-public.js';
import {applyCategoryPhotos} from './category-photos.js';
await startCatalog({slug:'lapis-de-cor',appScript:'app.js',layoutScript:'modelo.js'});
applyCategoryPhotos();
