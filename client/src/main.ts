import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/core/auth';
bootstrapApplication(AppComponent, { providers: [provideRouter(routes, withHashLocation()), provideHttpClient(withInterceptors([authInterceptor]))] });