import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'lib-paginator',
  templateUrl: './paginator.component.html',
  styleUrls: ['./paginator.component.css']
})
export class PaginatorComponent implements OnChanges{
  @Input() questions;
  @Input() currentPage = 1;
  @Output() page = new EventEmitter();
  displayedPages: number[] = [];
  maxDisplayedPages = 6; // Maximum number of page numbers to display
  startPage:number;
  endPage:number;
  ngOnChanges(changes: SimpleChanges): void {
    if(changes['currentPage']){
      // this.currentPage = changes['currentPage'].currentValue;
      this.calculateDisplayedPages();
    }
  }

  // calculateDisplayedPages(): void {
  //   this.startPage = 0;
  //   this.endPage = this.questions.length;
  //   this.displayedPages = [this.startPage];
  //   for(let i = this.startPage; i < this.questions.length;i++){
  //     if(i - this.currentPage < 3){
  //       this.displayedPages.push(i);
  //     }
  //   }
  //   this.displayedPages.push(-1);
  //   this.displayedPages.push(this.endPage);
  // }

  calculateDisplayedPages(): void {
    const halfMaxPages = Math.floor(this.maxDisplayedPages / 2);
    let startPage = Math.max(1, this.currentPage - halfMaxPages);
    let endPage = Math.min(this.questions.length, startPage + this.maxDisplayedPages - 1);

    if (this.questions.length <= this.maxDisplayedPages) {
      this.displayedPages = Array.from({ length: this.questions.length }, (_, i) => i + 1);
    } else {
      if (this.currentPage <= halfMaxPages) {
        startPage = 1;
        endPage = this.maxDisplayedPages;
      } else if (this.currentPage >= this.questions.length - halfMaxPages) {
        startPage = this.questions.length - this.maxDisplayedPages + 1;
        endPage = this.questions.length;
      }

      this.displayedPages = [];

      if (startPage > 1) {
        this.displayedPages.push(-1); // Use -1 or any indicator for ellipses
      }

      for (let i = startPage; i <= endPage; i++) {
        this.displayedPages.push(i);
      }

      if (endPage < this.questions.length) {
        this.displayedPages.push(-1); // Use -1 or any indicator for ellipses
      }
    }
  }

  pageChange(currentPage){
    this.page.emit({
      pageIndex:currentPage
    })
  }
}
