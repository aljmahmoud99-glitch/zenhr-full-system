import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse } from '../models';

export interface OrgNode {
  id: number;
  companyId: number;
  parentId?: number | null;
  nodeType: 'company' | 'branch' | 'department' | 'section' | 'unit';
  nameAr: string;
  nameEn: string;
  code?: string | null;
  managerEmployeeId?: number | null;
  managerNameAr?: string | null;
  isActive: boolean;
  sortOrder: number;
  breadcrumb?: string;
}

export interface OrgNodeTree extends OrgNode {
  children: OrgNodeTree[];
}

@Injectable({ providedIn: 'root' })
export class OrgNodesService {
  private readonly treeSubject = new BehaviorSubject<OrgNodeTree[]>([]);
  readonly tree$ = this.treeSubject.asObservable();

  constructor(private api: ApiService) {}

  getTree(): Observable<ApiResponse<OrgNodeTree[]>> {
    return this.api.get<ApiResponse<OrgNodeTree[]>>('/api/org-nodes').pipe(
      tap(response => this.treeSubject.next(response.data ?? []))
    );
  }

  getFlat(): Observable<ApiResponse<OrgNode[]>> {
    return this.api.get<ApiResponse<OrgNode[]>>('/api/org-nodes/flat');
  }

  refreshTree() {
    return this.getTree();
  }
}
