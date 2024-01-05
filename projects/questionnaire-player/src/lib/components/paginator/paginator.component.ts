import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'lib-paginator',
  templateUrl: './paginator.component.html',
  styleUrls: ['./paginator.component.css']
})
export class PaginatorComponent implements OnChanges{
  @Input() questions;
  @Input() currentPage = 0;
  @Output() page = new EventEmitter();
  displayedPages: number[] = [];
  maxDisplayedPages = 6; // Maximum number of page numbers to display
  startPage:number;
  endPage:number;
  ngOnChanges(changes: SimpleChanges): void {
    if(changes['currentPage']){
      this.calculateDisplayedPages();
    }
  }

  calculateDisplayedPages(): void {
    let startPage = 0;
    let endPage = this.questions.length-1;
    const allowedToShow = [startPage,startPage+1,endPage,endPage-1].includes(this.currentPage) ? (this.maxDisplayedPages/2) :(this.maxDisplayedPages/2)-2
    console.log('start page',startPage);
    console.log('end page',endPage);

    if (this.questions.length <= this.maxDisplayedPages) {
      this.displayedPages = Array.from({ length: this.questions.length }, (_, i) => i + 1);
    } else {
      this.displayedPages = [startPage];

      for (let i = (startPage+1); i < endPage; i++) {
        if((i > (this.currentPage+allowedToShow) || i < this.currentPage-allowedToShow)){
          this.displayedPages.push(-1)
        }else{
        this.displayedPages.push(i);
        }
      }

      this.displayedPages.push(endPage);
      // this.displayedPages = [...new Set(this.displayedPages)];
      console.log('diaplyed page',this.displayedPages);
    }
  }

  pageChange(currentPage){
    this.currentPage = currentPage;
    this.page.emit({
      pageIndex:currentPage
    })
  }
}
