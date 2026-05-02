
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  get<T>(url: string, params?: Record<string, string | number | boolean | null | undefined>): Observable<T> {
    let p = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') p = p.set(k, String(v));
      });
    }
    return this.http.get<T>(url, { params: p });
  }

  post<T>(url: string, body: unknown): Observable<T> { return this.http.post<T>(url, body); }
  put<T>(url: string, body: unknown): Observable<T> { return this.http.put<T>(url, body); }
  patch<T>(url: string, body?: unknown): Observable<T> { return this.http.patch<T>(url, body ?? {}); }
  delete<T>(url: string): Observable<T> { return this.http.delete<T>(url); }
}
