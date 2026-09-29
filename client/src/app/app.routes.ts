import { Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { LoginComponent } from './pages/login.component';
import { HomeComponent } from './pages/home.component';
import { ItemDetailsComponent } from './pages/item-details.component';
import { ReportComponent } from './pages/report.component';
import { MyItemsComponent } from './pages/my-items.component';
import { ProfileComponent } from './pages/profile.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: 'login', component: LoginComponent },
  { path: 'home', component: HomeComponent, canActivate: [authGuard] },
  { path: 'item/:id', component: ItemDetailsComponent, canActivate: [authGuard] },
  { path: 'report', component: ReportComponent, canActivate: [authGuard] },
  { path: 'my-items', component: MyItemsComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'home' },
];
