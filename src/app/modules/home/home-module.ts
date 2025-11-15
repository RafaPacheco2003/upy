import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HomeRoutingModule } from './home-routing-module';
import { PagesComponent } from './pages/pages';


@NgModule({
  imports: [
    CommonModule,
    HomeRoutingModule,
    PagesComponent
  ]
})
export class HomeModule { }
